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
    // Name tag and emoji bubble, in metres. The tag used to be 1.1 x 0.28 m (wider than the person under it).
    static TAG_WIDTH = 0.6;
    static TAG_HEIGHT = 0.15;
    static TAG_Y = 2.0;
    static EMOJI_SIZE = 0.3;
    static EMOJI_Y = 2.3;
    // Typed chat: a speech bubble above the emoji, shown for a few seconds.
    static CHAT_WIDTH = 0.9;
    static CHAT_Y = 2.62;
    static CHAT_MIN_SECONDS = 5;
    static CHAT_MAX_SECONDS = 12;

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
        this.nameTags = true;
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
            chatPlane: null, chatTimer: 0,
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

    /**
     * A label material: the canvas is both the colour and the alpha, and it never writes depth. That last part is not
     * cosmetic. A StandardMaterial is pre-pass capable while it writes depth, so on the desktop tiers with screen-space
     * reflections it rendered into the SSR pre-pass, and the SSR composition drew the tag and every emoji as black
     * shapes (mobile and Quest have no SSR, so they looked right). A material that does not write depth is drawn on the
     * colour attachment only, whenever and however the pre-pass renderer is created.
     */
    _labelMaterial(name, texture) {
        const mat = new BABYLON.StandardMaterial(name, this.scene);
        mat.diffuseTexture = texture;
        mat.emissiveColor = new BABYLON.Color3(1, 1, 1);
        mat.disableLighting = true;
        mat.backFaceCulling = false;
        mat.useAlphaFromDiffuseTexture = true;
        mat.disableDepthWrite = true;
        mat.fogEnabled = false;
        return mat;
    }

    _createLabel(peer, root) {
        const scene = this.scene;
        const id = peer.id;
        const plane = BABYLON.MeshBuilder.CreatePlane(`remoteLabel_${id}`,
            { width: AvatarManager.TAG_WIDTH, height: AvatarManager.TAG_HEIGHT }, scene);
        plane.parent = root;
        plane.position.y = AvatarManager.TAG_Y;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        plane.isPickable = false;

        // Twice the old resolution on a plane about half the size, with mipmaps so the name stays legible from across
        // the floor instead of shimmering into noise.
        const dt = new BABYLON.DynamicTexture(`remoteLabelTex_${id}`, { width: 512, height: 128 }, scene, true);
        dt.hasAlpha = true;
        plane.material = this._labelMaterial(`remoteLabelMat_${id}`, dt);
        plane.setEnabled(this.nameTags);
        peer.nameplate = plane;
        this._drawNameplate(peer);
        return plane;
    }

    /** The tag: the name, a crown for the host, a red name when muted, a green outline while they speak. */
    _drawNameplate(peer) {
        const dt = peer.nameplate && peer.nameplate.material && peer.nameplate.material.diffuseTexture;
        if (!dt) return;
        const ctx = dt.getContext();
        const { width, height } = dt.getSize();
        ctx.clearRect(0, 0, width, height);
        const text = `${peer.isHost ? '\u{1F451} ' : ''}${String(peer.name || 'Guest').slice(0, 16)}${peer.muted ? ' \u{1F507}' : ''}`;
        // A pill only as wide as the name, so a short name is a small tag rather than a long dark bar.
        let size = 64;
        ctx.font = `bold ${size}px sans-serif`;
        const maxText = width - 56;
        const measured = ctx.measureText(text).width;
        if (measured > maxText) {
            size = Math.max(36, Math.floor(size * maxText / measured));
            ctx.font = `bold ${size}px sans-serif`;
        }
        const textWidth = Math.min(maxText, ctx.measureText(text).width);
        const pillW = Math.min(width - 4, textWidth + 48);
        const pillH = height - 12;
        const x = (width - pillW) / 2, y = 6, r = pillH / 2;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + pillW, y, x + pillW, y + pillH, r);
        ctx.arcTo(x + pillW, y + pillH, x, y + pillH, r);
        ctx.arcTo(x, y + pillH, x, y, r);
        ctx.arcTo(x, y, x + pillW, y, r);
        ctx.closePath();
        ctx.fillStyle = 'rgba(0,0,0,0.5)';
        ctx.fill();
        if (peer.speaking) {
            ctx.strokeStyle = '#3dff9a';
            ctx.lineWidth = 8;
            ctx.stroke();
        }
        ctx.fillStyle = peer.muted ? '#ff8f8f' : '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, width / 2, height / 2 + 2, maxText);
        dt.update();
    }

    /** Show or hide every guest's name tag (emoji bubbles stay: they are what the guest chose to say). */
    setNameTags(enabled) {
        this.nameTags = !!enabled;
        for (const peer of this.remotes.values()) if (peer.nameplate) peer.nameplate.setEnabled(this.nameTags);
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
        const plane = BABYLON.MeshBuilder.CreatePlane(`remoteEmoji_${id}`, { size: AvatarManager.EMOJI_SIZE }, scene);
        plane.parent = peer.root;
        plane.position.y = AvatarManager.EMOJI_Y;
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

        plane.material = this._labelMaterial(`remoteEmojiMat_${id}`, dt);

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
        if (peer.chatPlane) {
            peer.chatPlane.material.diffuseTexture.dispose();
            peer.chatPlane.material.dispose();
            peer.chatPlane.dispose();
            peer.chatPlane = null;
        }
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
            if (peer.chatPlane && peer.chatPlane.isEnabled()) {
                peer.chatTimer -= step;
                if (peer.chatTimer <= 0) peer.chatPlane.setEnabled(false);
            }
        }
    }

    // ───────────────────────── typed chat: a speech bubble over the sender ─────────────────────────

    /**
     * Show a typed message above the guest who sent it, for a few seconds (longer for a longer message). This is what
     * makes chat readable in the headset, where the DOM chat log cannot be seen. One plane per guest, redrawn per
     * message, so a chatty guest does not churn GPU resources. Text is drawn with fillText, never interpreted.
     */
    showChat(id, text) {
        const peer = this.remotes.get(id);
        if (!peer || typeof text !== 'string' || !text) return;
        if (!peer.chatPlane) peer.chatPlane = this._createChatPlane(peer);
        this._drawChat(peer.chatPlane.material.diffuseTexture, text);
        peer.chatPlane.setEnabled(true);
        peer.chatTimer = Math.min(AvatarManager.CHAT_MAX_SECONDS, AvatarManager.CHAT_MIN_SECONDS + text.length * 0.06);
    }

    _createChatPlane(peer) {
        const plane = BABYLON.MeshBuilder.CreatePlane(`remoteChat_${peer.id}`,
            { width: AvatarManager.CHAT_WIDTH, height: AvatarManager.CHAT_WIDTH * 160 / 512 }, this.scene);
        plane.parent = peer.root;
        plane.position.y = AvatarManager.CHAT_Y;
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL;
        plane.isPickable = false;
        const dt = new BABYLON.DynamicTexture(`remoteChatTex_${peer.id}`, { width: 512, height: 160 }, this.scene, true);
        dt.hasAlpha = true;
        plane.material = this._labelMaterial(`remoteChatMat_${peer.id}`, dt);
        plane.setEnabled(false);
        return plane;
    }

    /** Word-wrapped onto at most three lines inside a rounded white bubble; a longer message ends in an ellipsis. */
    _drawChat(dt, text) {
        const ctx = dt.getContext();
        const { width, height } = dt.getSize();
        ctx.clearRect(0, 0, width, height);
        const font = 30, lineHeight = 38, pad = 16, maxLines = 3, maxWidth = width - pad * 2 - 8;
        ctx.font = `600 ${font}px sans-serif`;
        const lines = AvatarManager.wrapText(text, maxWidth, maxLines, value => ctx.measureText(value).width);
        const boxH = lines.length * lineHeight + pad * 2 - 8;
        const boxW = Math.min(width - 4, Math.max(...lines.map(line => ctx.measureText(line).width)) + pad * 2 + 8);
        const x = (width - boxW) / 2, y = (height - boxH) / 2, r = 18;
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + boxW, y, x + boxW, y + boxH, r);
        ctx.arcTo(x + boxW, y + boxH, x, y + boxH, r);
        ctx.arcTo(x, y + boxH, x, y, r);
        ctx.arcTo(x, y, x + boxW, y, r);
        ctx.closePath();
        ctx.fillStyle = 'rgba(255,255,255,0.92)';
        ctx.fill();
        ctx.fillStyle = '#111111';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        lines.forEach((line, i) => ctx.fillText(line, width / 2, y + pad - 4 + lineHeight * (i + 0.5)));
        dt.update();
    }

    /**
     * Greedy word wrap. `measure(text)` returns a width. A word wider than a line is split into line-sized pieces, and
     * text that needs more than `maxLines` ends in an ellipsis. Pure, so it is unit-tested without a canvas.
     */
    static wrapText(text, maxWidth, maxLines, measure) {
        const pieces = [];
        for (const word of String(text).split(' ').filter(Boolean)) {
            let rest = Array.from(word);
            while (rest.length) {
                let fit = rest.length;
                while (fit > 1 && measure(rest.slice(0, fit).join('')) > maxWidth) fit--;
                pieces.push(rest.slice(0, fit).join(''));
                rest = rest.slice(fit);
            }
        }
        const lines = [];
        let line = '';
        for (const piece of pieces) {
            const candidate = line ? `${line} ${piece}` : piece;
            if (!line || measure(candidate) <= maxWidth) { line = candidate; continue; }
            lines.push(line);
            line = piece;
        }
        if (line) lines.push(line);
        if (lines.length <= maxLines) return lines;
        const kept = lines.slice(0, maxLines);
        let last = kept[maxLines - 1];
        while (last && measure(`${last}\u2026`) > maxWidth) last = Array.from(last).slice(0, -1).join('');
        kept[maxLines - 1] = `${last}\u2026`;
        return kept;
    }

    /** Is anyone in the room audibly speaking right now (not muted)? Drives the music ducking. */
    anyoneSpeaking() {
        for (const peer of this.remotes.values()) if (peer.speaking) return true;
        return false;
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
