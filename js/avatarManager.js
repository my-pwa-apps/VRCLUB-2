'use strict';
/**
 * Visual and spatial-audio representation of the OTHER guests in a shared
 * session. Driven entirely by `NetworkClient` events wired up by js/multiplayer.js;
 * this class never touches the network itself.
 *
 * Each remote guest is one of the club's Quaternius people (the relay hands every guest a different random one, see
 * AVATARS in worker/src/index.js). They are played, not posed: the people files carry the packs' own Idle, Walk, Run
 * and Wave clips plus the retargeted Yes (a nod) and Dance_Loop, and this class picks one from how fast the guest is
 * moving and what gesture they sent, cross-fading between them. Only the first MAX_PEOPLE guests get a skinned body
 * (a skeleton each); the rest, and any guest whose character is still loading, are a capsule + head. The capsule
 * always stays as an invisible collision body. A floating name tag and an emoji bubble ride on top. Position and
 * facing are interpolated toward the last network sample rather than snapped, because state arrives far slower than
 * the render loop.
 *
 * Safety lives here too, on the receiving side: a guest can be muted (their voice node is silenced, the connection
 * stays so unmuting is instant) and a personal-space bubble hides anyone who comes within arm's length.
 */
class AvatarManager {
    /** Remote `state.y` is the sender's EYE height; the avatar head sits this far above its root. */
    static EYE_HEIGHT = 1.7;
    // Mirrors the Multiplayer panel's buttons and the relay's allow-list.
    static ALLOWED_EMOJI = new Set(['🎉', '🔥', '❤️', '😂', '👋', '🙌', '💃', '🕺']);
    static EMOJI_MIN_INTERVAL = 0.5; // seconds between reactions rendered per guest
    static GESTURE_MIN_INTERVAL = 0.4;
    static MAX_PEOPLE = 8;           // skinned bodies for remote guests (each is a 62-bone skeleton and one draw)
    static PERSON_HEIGHT = { f: 1.68, m: 1.8 };
    static WALK_SPEED = 0.25;        // m/s above which a guest is walking
    static RUN_SPEED = 2.6;
    static BUBBLE_HIDE = 0.7;        // personal space: hide within this many metres...
    static BUBBLE_SHOW = 0.95;       // ...and show again beyond this (hysteresis)

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
        this.personalSpace = true;
        this.muteAll = false;
        this._frame = 0;
        this.onSpeakingChange = () => {};
    }

    _getMaterial() {
        if (this._material) return this._material;
        this._material = this.club.materialFactory
            ? this.club.materialFactory.createPBRMaterial('remotePlayerMat',
                { baseColor: [0.25, 0.75, 1.0], metallic: 0.15, roughness: 0.55 }, true)
            : new BABYLON.StandardMaterial('remotePlayerMat', this.scene);
        return this._material;
    }

    /** @param {{pid?:string|null, avatar?:string|null}} [info] */
    ensurePeer(id, name, info = {}) {
        let peer = this.remotes.get(id);
        if (peer) {
            if (name) { peer.name = name; this._drawNameplate(peer); }
            if (info.avatar && info.avatar !== peer.avatarId) this.setAvatar(id, info.avatar);
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

        peer = {
            id, name: name || 'Guest', pid: info.pid || null, avatarId: null,
            root, body, head, nameplate: null, person: null,
            muted: false, speaking: false, isHost: false, hidden: false,
            pose: null,
            emojiPlane: null, emojiTimer: 0, lastEmojiAt: -Infinity,
            gesture: { until: 0, last: -Infinity, dancing: false },
            speed: 0, prevX: NaN, prevZ: NaN,
            target: { x: root.position.x, y: root.position.y, z: root.position.z, rotY: 0 },
            hasState: false,
            audio: null
        };
        peer.nameplate = this._createLabel(peer, root);
        this.remotes.set(id, peer);
        if (info.avatar) this.setAvatar(id, info.avatar);
        return peer;
    }

    // ───────────────────────── the person (a skinned Quaternius character) ─────────────────────────

    /** Give a guest a character. Falls back to the capsule while it loads, when it cannot, or past MAX_PEOPLE. */
    async setAvatar(id, avatarId) {
        const peer = this.remotes.get(id);
        if (!peer || peer.avatarId === avatarId) return;
        peer.avatarId = avatarId;
        this._disposePerson(peer);
        await this._buildPerson(peer);
    }

    _peopleCount() {
        let live = 0;
        for (const other of this.remotes.values()) if (other.person) live++;
        return live;
    }

    async _buildPerson(peer) {
        const club = this.club;
        const Crowd = window.VRClubAudioCrowd;
        const avatarId = peer.avatarId;
        if (!avatarId || !Crowd || !club._loadCrowdSource || !club._crowdSourceContainers) return false;
        if (peer.person || this._peopleCount() >= AvatarManager.MAX_PEOPLE) return false;
        const index = Crowd.sourceIndex(avatarId);
        if (index < 0) return false;
        const container = await club._loadCrowdSource(index);
        // The guest may have left, changed avatar or been given a body by a faster call while the file loaded.
        if (!container || this.remotes.get(peer.id) !== peer || peer.avatarId !== avatarId || peer.person || this._peopleCount() >= AvatarManager.MAX_PEOPLE) return false;

        const prefix = `peer${peer.id}_`;
        const entry = container.instantiateModelsToScene(name => `${prefix}${name}`, false, { doNotInstantiate: true });
        const node = entry.rootNodes[0];
        if (!node) { entry.dispose(); return false; }
        node.parent = peer.root;
        node.position.set(0, 0, 0);
        node.rotationQuaternion = null;
        node.rotation.set(0, 0, 0);
        node.scaling.setAll(1);
        node.computeWorldMatrix(true);
        // Normalise on real-world height, as the crowd does, and stand the feet on the guest's floor.
        const height = AvatarManager.PERSON_HEIGHT[avatarId[0]] || 1.72;
        let bounds = node.getHierarchyBoundingVectors(true);
        const rawHeight = bounds.max.y - bounds.min.y;
        if (rawHeight > 1e-6) node.scaling.setAll(height / rawHeight);
        node.computeWorldMatrix(true);
        bounds = node.getHierarchyBoundingVectors(true);
        node.position.y += peer.root.getAbsolutePosition().y - bounds.min.y;

        const meshes = [];
        node.getChildMeshes().forEach(mesh => {
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true;   // skinned bind-pose bounds cull wrongly
            mesh.renderingGroupId = 0;
            meshes.push(mesh);
        });

        // Keep the clips a guest can play; any other would still be evaluated every frame.
        const wanted = new Set(['Idle', 'Walk', 'Run', 'Wave', 'Yes', 'Dance_Loop']);
        const groups = {};
        for (const group of entry.animationGroups) {
            const clip = group.name.startsWith(prefix) ? group.name.slice(prefix.length) : group.name;
            if (!wanted.has(clip)) { group.dispose(); continue; }
            group.enableBlending = true;
            group.blendingSpeed = 0.06;
            groups[clip] = group;
        }
        if (!groups.Idle) { entry.dispose(); return false; }

        peer.person = { entry, node, meshes, groups, current: null, speedRatio: 1 };
        peer.body.isVisible = false;   // stays as the collision body
        peer.head.isVisible = false;
        this._applyHidden(peer);
        this._play(peer, 'Idle', true, 1);
        if (this.club._refreshContactShadows) this.club._refreshContactShadows();
        return true;
    }

    _disposePerson(peer) {
        const person = peer.person;
        if (!person) return;
        peer.person = null;
        try { person.entry.dispose(); } catch (_) { /* already gone */ }
        peer.body.isVisible = true;
        peer.head.isVisible = true;
    }

    /** Start (or keep) a clip. A running clip is stopped first: one skeleton evaluates one animation. */
    _play(peer, clip, loop, speedRatio) {
        const person = peer.person;
        if (!person) return;
        const group = person.groups[clip];
        if (!group) return;
        if (person.current === clip) {
            group.speedRatio = speedRatio;
            return;
        }
        const previous = person.groups[person.current];
        if (previous) previous.stop();
        group.start(loop, speedRatio);
        group.speedRatio = speedRatio;
        person.current = clip;
        if (!loop) {
            group.onAnimationGroupEndObservable.addOnce(() => {
                if (peer.person && peer.person.current === clip) peer.person.current = null;
            });
        }
    }

    /** One of 'wave', 'nod', 'dance', 'stop' from a guest. */
    playGesture(id, gesture) {
        const peer = this.remotes.get(id);
        if (!peer) return;
        const now = (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
        if (now - peer.gesture.last < AvatarManager.GESTURE_MIN_INTERVAL) return;
        peer.gesture.last = now;
        if (gesture === 'dance') { peer.gesture.dancing = true; return; }
        if (gesture === 'stop') { peer.gesture.dancing = false; return; }
        const person = peer.person;
        const clip = gesture === 'wave' ? 'Wave' : gesture === 'nod' ? 'Yes' : null;
        if (!person || !clip || !person.groups[clip]) return;
        peer.gesture.dancing = false;
        this._play(peer, clip, false, 1);
    }

    // ───────────────────────── name tag ─────────────────────────

    _createLabel(peer, root) {
        const scene = this.scene;
        const id = peer.id;
        const plane = BABYLON.MeshBuilder.CreatePlane(`remoteLabel_${id}`, { width: 1.1, height: 0.28 }, scene);
        plane.parent = root;
        plane.position.y = 2.05;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        plane.isPickable = false;

        const dt = new BABYLON.DynamicTexture(`remoteLabelTex_${id}`, { width: 256, height: 64 }, scene, false);
        dt.hasAlpha = true;

        const mat = new BABYLON.StandardMaterial(`remoteLabelMat_${id}`, scene);
        mat.diffuseTexture = dt;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        mat.useAlphaFromDiffuseTexture = true;
        plane.material = mat;
        peer.nameplate = plane;
        this._drawNameplate(peer);
        return plane;
    }

    /** The tag: the name, a crown for the host, a red bar when muted, a green frame while they speak. */
    _drawNameplate(peer) {
        const dt = peer.nameplate && peer.nameplate.material && peer.nameplate.material.diffuseTexture;
        if (!dt) return;
        const ctx = dt.getContext();
        const { width, height } = dt.getSize();
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fillRect(0, 0, width, height);
        if (peer.speaking) {
            ctx.strokeStyle = '#3dff9a';
            ctx.lineWidth = 6;
            ctx.strokeRect(3, 3, width - 6, height - 6);
        }
        ctx.font = 'bold 28px sans-serif';
        ctx.fillStyle = peer.muted ? '#ff8f8f' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const text = `${peer.isHost ? '\u{1F451} ' : ''}${String(peer.name || 'Guest').slice(0, 16)}${peer.muted ? ' \u{1F507}' : ''}`;
        ctx.fillText(text, width / 2, height / 2);
        dt.update();
    }

    setHost(id, isHost) {
        const peer = this.remotes.get(id);
        if (!peer || peer.isHost === !!isHost) return;
        peer.isHost = !!isHost;
        this._drawNameplate(peer);
    }

    // ───────────────────────── state, emoji ─────────────────────────

    /** @param {{x:number,y:number,z:number,rotY:number}} state - y is the sender's eye height */
    updatePeerState(id, name, state, info) {
        if (!state) return;
        const peer = this.ensurePeer(id, name, info || {});
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
            peer.prevX = peer.target.x; peer.prevZ = peer.target.z;
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
        this._clearEmoji(peer);

        const scene = this.scene;
        const plane = BABYLON.MeshBuilder.CreatePlane(`remoteEmoji_${id}`, { size: 0.5 }, scene);
        plane.parent = peer.root;
        plane.position.y = 2.45;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        plane.isPickable = false;

        const dt = new BABYLON.DynamicTexture(`remoteEmojiTex_${id}`, { width: 128, height: 128 }, scene, false);
        dt.hasAlpha = true;
        const ctx = dt.getContext();
        ctx.font = '96px sans-serif';
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

    _clearEmoji(peer) {
        if (!peer.emojiPlane) return;
        peer.emojiPlane.material.diffuseTexture.dispose();
        peer.emojiPlane.material.dispose();
        peer.emojiPlane.dispose();
        peer.emojiPlane = null;
    }

    // ───────────────────────── voice ─────────────────────────

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
        gain.gain.value = peer.muted || this.muteAll ? 0 : 1.0;
        // A level meter for the speaking indicator; it is a dead end (nothing is connected after it).
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;

        source.connect(panner);
        source.connect(analyser);
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
        peer.audio = { source, panner, gain, analyser, element, level: new Uint8Array(analyser.fftSize) };
    }

    detachVoice(id) {
        const peer = this.remotes.get(id);
        if (!peer || !peer.audio) return;
        for (const node of [peer.audio.source, peer.audio.panner, peer.audio.gain, peer.audio.analyser]) {
            try { node.disconnect(); } catch { /* ignore */ }
        }
        if (peer.audio.element) {
            try { peer.audio.element.pause(); } catch { /* ignore */ }
            peer.audio.element.srcObject = null;
        }
        peer.audio = null;
        if (peer.speaking) { peer.speaking = false; this._drawNameplate(peer); }
    }

    /** Silence (or restore) one guest. Their connection stays up, so un-muting is instant. */
    setMuted(id, muted) {
        const peer = this.remotes.get(id);
        if (!peer) return;
        peer.muted = !!muted;
        this._applyGain(peer);
        this._drawNameplate(peer);
    }

    setMuteAll(muted) {
        this.muteAll = !!muted;
        for (const peer of this.remotes.values()) this._applyGain(peer);
    }

    _applyGain(peer) {
        if (peer.audio && peer.audio.gain) peer.audio.gain.gain.value = peer.muted || this.muteAll ? 0 : 1.0;
    }

    // ───────────────────────── safety: the personal-space bubble ─────────────────────────

    setPersonalSpace(enabled) {
        this.personalSpace = !!enabled;
        if (!this.personalSpace) for (const peer of this.remotes.values()) { peer.hidden = false; this._applyHidden(peer); }
    }

    _applyHidden(peer) {
        // Everything of theirs except the voice: the tag, the body, the emoji and the collision capsule.
        peer.root.setEnabled(!peer.hidden);
    }

    _updateBubble(peer) {
        if (!this.personalSpace) return;
        const camera = this.club._playerCamera ? this.club._playerCamera() : this.scene.activeCamera;
        const eye = camera && (camera.globalPosition || camera.position);
        if (!eye) return;
        const dx = eye.x - peer.root.position.x, dz = eye.z - peer.root.position.z;
        const near = Math.hypot(dx, dz);
        const level = Math.abs(eye.y - (peer.root.position.y + AvatarManager.EYE_HEIGHT)) < 1.6;
        const hidden = peer.hidden ? !(near > AvatarManager.BUBBLE_SHOW || !level) : (near < AvatarManager.BUBBLE_HIDE && level);
        if (hidden !== peer.hidden) { peer.hidden = hidden; this._applyHidden(peer); }
    }

    // ───────────────────────── lifecycle ─────────────────────────

    removePeer(id) {
        const peer = this.remotes.get(id);
        if (!peer) return;
        this.detachVoice(id);
        this._clearEmoji(peer);
        peer.nameplate.material.diffuseTexture.dispose();
        peer.nameplate.material.dispose();
        peer.nameplate.dispose();
        this._disposePerson(peer);
        peer.body.dispose();
        peer.head.dispose();
        peer.root.dispose();
        this.remotes.delete(id);
        // A capsule that was waiting for a body gets the place this guest freed.
        for (const other of this.remotes.values()) {
            if (!other.person && other.avatarId) { this._buildPerson(other); break; }
        }
        if (this.club._refreshContactShadows) this.club._refreshContactShadows();
    }

    /** What the people list shows. */
    list() {
        return [...this.remotes.values()].map(peer => ({
            id: peer.id, name: peer.name, pid: peer.pid, avatar: peer.avatarId,
            muted: peer.muted, speaking: peer.speaking, isHost: peer.isHost
        }));
    }

    /** Called once per frame from VRClubAnimationCore.updateAnimations() with ctx.dt (seconds). */
    update(dt) {
        if (!(dt > 0)) return;
        // Exponential smoother compounded for frame-rate independence (see
        // .github/copilot-instructions.md - "never scale a bare retention rate").
        const step = dt;
        const lerpK = 1 - (1 - 0.15) ** (step * 60);
        this._frame++;

        for (const peer of this.remotes.values()) {
            const root = peer.root;
            root.position.x += (peer.target.x - root.position.x) * lerpK;
            root.position.y += (peer.target.y - root.position.y) * lerpK;
            root.position.z += (peer.target.z - root.position.z) * lerpK;

            // JavaScript's % keeps the dividend's sign, so the previous wrap left
            // differences below -PI unwrapped and avatars spun the long way round.
            root.rotation.y += AvatarManager.shortestAngle(root.rotation.y, peer.target.rotY) * lerpK;

            if (peer.hasState) {
                // Ground speed, smoothed: it picks idle, walk or run, and the walk's playback rate.
                if (Number.isFinite(peer.prevX)) {
                    const instant = Math.hypot(root.position.x - peer.prevX, root.position.z - peer.prevZ) / step;
                    peer.speed += (Math.min(instant, 8) - peer.speed) * (1 - (1 - 0.2) ** (step * 60));
                }
                peer.prevX = root.position.x; peer.prevZ = root.position.z;
                if (peer.person) this._updateClip(peer);
            }
            this._updateBubble(peer);

            if (peer.audio && peer.audio.panner) {
                AudioUtils.setPannerPosition(peer.audio.panner,
                    root.position.x, root.position.y + AvatarManager.EYE_HEIGHT, root.position.z);
                if (this._frame % 6 === 0) this._updateSpeaking(peer);
            }

            if (peer.emojiPlane) {
                peer.emojiTimer -= step;
                if (peer.emojiTimer <= 0) this._clearEmoji(peer);
            }
        }
    }

    _updateClip(peer) {
        const person = peer.person;
        const moving = peer.speed > AvatarManager.WALK_SPEED;
        // A gesture plays to its end; walking away from a dance ends it.
        if (person.current === 'Wave' || person.current === 'Yes') return;
        if (peer.gesture.dancing && moving) peer.gesture.dancing = false;
        if (peer.gesture.dancing && person.groups.Dance_Loop) { this._play(peer, 'Dance_Loop', true, 1); return; }
        if (peer.speed > AvatarManager.RUN_SPEED && person.groups.Run) this._play(peer, 'Run', true, Math.min(1.5, peer.speed / 4));
        else if (moving && person.groups.Walk) this._play(peer, 'Walk', true, Math.min(1.7, Math.max(0.6, peer.speed / 1.4)));
        else this._play(peer, 'Idle', true, 1);
    }

    _updateSpeaking(peer) {
        const audio = peer.audio;
        if (!audio || !audio.analyser) return;
        audio.analyser.getByteTimeDomainData(audio.level);
        let sum = 0;
        for (let i = 0; i < audio.level.length; i++) { const v = (audio.level[i] - 128) / 128; sum += v * v; }
        const speaking = !peer.muted && !this.muteAll && Math.sqrt(sum / audio.level.length) > 0.03;
        if (speaking === peer.speaking) return;
        peer.speaking = speaking;
        this._drawNameplate(peer);
        this.onSpeakingChange(peer.id, speaking);
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
