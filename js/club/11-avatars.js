'use strict';

class VRClubAvatars extends window.VRClubAudio {
    static _vector3Interpolation(start, end, gradient) {
        BABYLON.Vector3.LerpToRef(start, end, gradient, this._vrclubInterpolationValue);
        return this._vrclubInterpolationValue;
    }

    static _quaternionInterpolation(start, end, gradient) {
        BABYLON.Quaternion.SlerpToRef(start, end, gradient, this._vrclubInterpolationValue);
        return this._vrclubInterpolationValue;
    }

    /**
     * Pose every finger and thumb joint at the clip's first key and stop animating it: the joints keep that pose, and the
     * group evaluates a third of the channels. Returns how many channels were removed. Must run before the group starts.
     */
    static _freezeFingerChannels(group, prefix = '') {
        if (!group || !group.targetedAnimations) return 0;
        const finger = /^(Index|Middle|Ring|Pinky|Thumb)\d\.[LR]$/;
        const drop = [];
        for (const targeted of group.targetedAnimations) {
            const target = targeted.target, animation = targeted.animation;
            if (!target || !animation || !finger.test(String(target.name).slice(prefix.length))) continue;
            const key = animation.getKeys && animation.getKeys()[0];
            const property = animation.targetProperty;
            if (key && key.value && property && target[property] && typeof target[property].copyFrom === 'function') {
                target[property].copyFrom(key.value);
            }
            drop.push(animation);
        }
        for (const animation of drop) group.removeTargetedAnimation(animation);
        return drop.length;
    }

    /**
     * Babylon's linear Vector3/Quaternion interpolators return a new object for every
     * animated joint, every frame. Give this crowd clone's Animation objects a private
     * reusable result instead; RuntimeAnimation immediately copies the value into its own
     * stable target, so no result escapes an evaluation.
     */
    static _reuseAnimationInterpolation(group) {
        if (!group || !group.targetedAnimations || !BABYLON.Animation) return 0;
        let count = 0;
        for (let i = 0; i < group.targetedAnimations.length; i++) {
            const animation = group.targetedAnimations[i].animation;
            if (!animation || animation._vrclubInterpolationValue) continue;
            if (animation.dataType === BABYLON.Animation.ANIMATIONTYPE_VECTOR3) {
                animation._vrclubInterpolationValue = new BABYLON.Vector3();
                animation.vector3InterpolateFunction = VRClubAudioCrowd._vector3Interpolation;
                count++;
            } else if (animation.dataType === BABYLON.Animation.ANIMATIONTYPE_QUATERNION) {
                animation._vrclubInterpolationValue = new BABYLON.Quaternion();
                animation.quaternionInterpolateFunction = VRClubAudioCrowd._quaternionInterpolation;
                count++;
            }
        }
        return count;
    }

    /**
     * Normalise the materials that arrive inside an avatar GLB.
     *
     * Runs ONCE per source file, not once per dancer: every clone shares these
     * materials, so a single pass covers the whole crowd.
     */
    _prepareAvatarMaterials(materials, garmentColor = null, hairColor = null) {
        const aniso = this.isInVRMode && this.isRenderExperimentEnabled('anisotropy')
            ? this._vrTextureAnisotropy() : this.tierSettings.anisotropy;

        materials.forEach(mat => {
            const characterHair = mat._vrclubCharacterHair === true;
            // Exceeding the device light budget produces "Too many lights" and a
            // black character, so this applies to imported materials too.
            mat.maxSimultaneousLights = this.maxLights;

            // VR stereo rendering is hypersensitive to transparency and these GLBs
            // ship alpha channels they do not actually use - without this the crowd
            // renders see-through in the headset.
            mat.alpha = 1.0;
            mat.transparencyMode = characterHair ? BABYLON.Material.MATERIAL_ALPHATEST : BABYLON.Material.MATERIAL_OPAQUE;
            if (mat.needAlphaBlending) mat.needAlphaBlending = () => false;
            if (mat.needAlphaTesting) mat.needAlphaTesting = () => characterHair;
            if (characterHair) { mat.useAlphaFromAlbedoTexture = true; mat.alphaCutOff = 0.45; }

            // Depth write is what makes the crowd OCCLUDE the additive light beams
            // in rendering group 1 instead of letting them shine straight through.
            mat.disableDepthWrite = false;
            mat.forceDepthWrite = true;
            mat.backFaceCulling = !characterHair;

            if (garmentColor && (mat.name === 'MI_Peasant' || mat.name === 'MI_Ranger') && mat.albedoColor) {
                mat.albedoColor.copyFrom(garmentColor);
            }
            // The hair texture is a pale grey strand map; the material colour makes it silver, brunette or anything else.
            if (hairColor && /^MI_Hair/.test(mat.name) && mat.albedoColor) {
                mat.albedoColor.copyFrom(hairColor);
            }

            [mat.albedoTexture, mat.diffuseTexture].forEach(tex => {
                if (!tex) return;
                tex.hasAlpha = characterHair;
                tex.anisotropicFilteringLevel = aniso;
            });

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
     * @param {object} [options]
     * @param {string} [options.clip]            which clip to play when the GLB carries several
     *                                           (default 'Dance_Loop'); the rest are discarded
     * @param {string[]} [options.clips]         keep these clips instead of only `clip`, for a guest who changes
     *                                           pose at runtime (the mingling guest walks and talks). Only one
     *                                           plays at a time; VRClubAudioCrowd._playClip switches between them.
     * @param {boolean} [options.reactsToBeat]   false for guests who do not dance (default true)
     * @param {object} [options.ambient]          subtle yaw and idle-speed variation for a fixed bystander
     */
    _spawnAvatar(container, name, position, facing, height, speedRatio, options = {}) {
        const originalHeight = height;
        if (container.character) height = container.character.height;
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
        root.rotationQuaternion = null;
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

        const meshes = [];
        entry.rootNodes.forEach(node => {
            node.getChildMeshes().forEach(mesh => {
                // Group 0 = opaque. Beams live in group 1 with additive blending and
                // are depth-tested against whatever group 0 already wrote.
                mesh.renderingGroupId = 0;
                mesh.isPickable = false;
                // Kept active until the whole-person motion envelope is installed below.
                mesh.alwaysSelectAsActiveMesh = true;
                meshes.push(mesh);
            });
        });
        if (container.character || container.characterSourceId) {
            window.AvatarDetails.applyNPC(meshes, container.character, this.materialFactory, name, container.characterSourceId);
        }
        if (typeof AvatarRig !== 'undefined' && AvatarRig.enableFrustumCulling) {
            AvatarRig.enableFrustumCulling(root, meshes);
        }

        // A multi-clip GLB (the leather-jacket guests) carries every pose it can strike. Keep the one this guest plays and drop
        // the others, so no hidden animation group keeps evaluating 60 joints.
        let groups = entry.animationGroups;
        const prefix = `${name}_`;
        const clipOf = group => (group.name.startsWith(prefix) ? group.name.slice(prefix.length) : group.name);
        let dance = null;
        let poses = null;
        if (options.repertoire && groups.some(group => clipOf(group) === 'Groove_Bounce')) {
            // A dancer who can do every move (the Quaternius people): keep the moves, start one, the choreographer
            // (CrowdDance, _updateCrowdDance) switches between them on the beat. Only one group plays at a time.
            const moves = new Map();
            groups.forEach(group => {
                if (options.repertoire.includes(clipOf(group))) moves.set(clipOf(group), group);
                else group.dispose();
            });
            const first = moves.get(options.clip || 'Dance_Loop') || moves.values().next().value;
            moves.forEach(group => {
                group.enableBlending = true;
                group.blendingSpeed = 0.08;
                VRClubAudioCrowd._reuseAnimationInterpolation(group);
            });
            let attentionSeed = 2166136261;
            for (let i = 0; i < name.length; i++) {
                attentionSeed ^= name.charCodeAt(i);
                attentionSeed = Math.imul(attentionSeed, 16777619);
            }
            dance = {
                groups: moves, current: first, state: null,
                attentionSeed: attentionSeed >>> 0,
                attentionYaw: 0, attentionTargetYaw: 0,
                attentionUntil: 0, nextAttention: 0, attending: false
            };
            groups = [first];
        } else if (options.clips && groups.length > 1) {
            // A guest who changes pose at runtime: keep the poses it can strike, drop the rest. Only the started
            // group evaluates; _playClip() swaps them, blending out of whatever the previous one left.
            const kept = new Map();
            groups.forEach(group => {
                if (options.clips.includes(clipOf(group))) kept.set(clipOf(group), group);
                else group.dispose();
            });
            const first = kept.get(options.clip) || kept.values().next().value;
            kept.forEach(group => { group.enableBlending = true; group.blendingSpeed = 0.06; });
            if (first) {
                poses = { groups: kept, current: first };
                groups = [first];
            } else {
                groups = [];
            }
        } else if (groups.length > 1) {
            const wanted = options.clip || 'Dance_Loop';
            const chosen = groups.find(group => clipOf(group) === wanted) || groups[0];
            groups.forEach(group => { if (group !== chosen) group.dispose(); });
            groups = [chosen];
        }

        // The pack's raw `Idle` animates every finger (108 channels, 40 without them). Fingers swing 15 degrees at most in that loop, so
        // a relaxed hand at frame 0 reads the same at queue distance; the other clips this club authors never drove fingers.
        groups.forEach(group => {
            if (clipOf(group) === 'Idle') VRClubAudioCrowd._freezeFingerChannels(group, prefix);
        });

        groups.forEach(group => {
            group.start(true);
            group.speedRatio = speedRatio;
            // Offset the phase, otherwise every clone of the same clip hits the same
            // pose on the same frame and the crowd looks like a chorus line.
            const span = group.to - group.from;
            if (span > 0) group.goToFrame(group.from + Math.random() * span);
        });
        if (groups.some(group => clipOf(group) === 'Idle_TalkingPhone_Loop')) {
            meshes.push(window.AvatarDetails.phone(meshes, this.materialFactory, name));
        }

        const npc = {
            name,
            character: container.character || null,
            characterSourceId: container.characterSourceId,
            characterEntry: entry,
            characterSpawn: { height: originalHeight, options, floorOffset: root.position.y - position.y },
            root,
            meshes,
            animations: groups,
            baseSpeed: speedRatio,
            // Guests who are not dancing keep their pose and their facing: no beat-driven tempo, no turning away.
            reactsToBeat: options.reactsToBeat !== false,
            homeYaw: options.reactsToBeat === false ? null : facing,
            avoidYaw: 0
        };
        if (dance) npc.dance = dance;
        if (poses) npc.poses = poses;
        if (options.ambient) {
            npc.ambient = {
                baseYaw: facing,
                yawRange: Math.max(0, options.ambient.yawRange || 0),
                speedVariation: Math.max(0, options.ambient.speedVariation || 0),
                period: Math.max(8, options.ambient.period || 18),
                phase: options.ambient.phase || 0
            };
        }
        npc.collider = this._attachOccupantCollider(root, name);
        this.npcAvatars.push(npc);

        return entry;
    }

    /**
     * Solid occupancy without a physics world. A static box at the feet is
     * enough: dancers do not translate, and the camera already carries an ellipsoid.
     */
    _attachOccupantCollider(root, name) {
        if (!root || !this.scene || !BABYLON.MeshBuilder) return null;
        const box = BABYLON.MeshBuilder.CreateBox(`${name}_occupant`, {
            width: 0.46,
            height: 1.7,
            depth: 0.46
        }, this.scene);
        box.position.set(root.position.x, root.position.y + 0.85, root.position.z);
        box.isVisible = false;
        box.isPickable = false;
        box.checkCollisions = true;
        return box;
    }

    // ───────────────────────── the player's own body ─────────────────────────
    //
    // A guest is not a crowd NPC: there is no walk or reach clip to play, and they must
    // move freely. AvatarRig poses the same dancer skeleton from where the player is and
    // where they look (and, in VR, where their hands are), so the body walks, turns,
    // crouches and reaches instead of replaying a dance.

    /** 'female' or 'male': the two UE-skeleton dancer sources the rig can wear. */
    getLocalAvatarStyle() {
        try { return localStorage.getItem('vrclub.avatarStyle') === 'male' ? 'male' : 'female'; }
        catch (_) { return 'female'; }
    }

    setLocalAvatarStyle(style) {
        const next = style === 'male' ? 'male' : 'female';
        try { localStorage.setItem('vrclub.avatarStyle', next); } catch (_) { /* private browsing */ }
        if (this._localRig) { this._localRig.dispose(); this._localRig = null; }
        this._spawnLocalPlayerBody();
        // The restroom mirror draws this body when no character is chosen: make it list the new meshes.
        this._mirrorSignature = -1;
        if (typeof this._refreshVRQuickMenu === 'function') this._refreshVRQuickMenu();
        return next;
    }

    /** The people a player can be: the same 17 characters the relay hands out (`f1`-`f8`, `m1`-`m9`). */
    static get MY_CHARACTERS() {
        return Object.freeze(['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'm1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9']);
    }

    /** The character this player chose for themselves (saved), or null for the default body. Offline, it is the mirror's reflection. */
    getLocalCharacter() {
        const appearance = this.getPersonalAppearance?.();
        if (appearance) return appearance.base;
        try {
            const id = localStorage.getItem('vrclub.myCharacter');
            return VRClubAudioCrowd.MY_CHARACTERS.includes(id) ? id : null;
        } catch (_) { return null; }
    }

    /** Save an exact character for both offline and online use; the relay confirms the shared appearance. */
    setLocalCharacter(id) {
        const next = VRClubAudioCrowd.MY_CHARACTERS.includes(id) ? id : null;
        const mp = this.multiplayer;
        if (next && mp && mp.connected && !mp.client.avatarSelectionSupported) {
            this.showErrorMessage('The relay needs an update before you can choose an exact character in a room.');
            return false;
        }
        const hadCustomAvatar = this.isCustomAvatarSelected?.() === true;
        if (hadCustomAvatar && !this.setCustomAvatarSelected(false)) return false;
        try {
            if (next) localStorage.setItem('vrclub.myCharacter', next);
            else localStorage.removeItem('vrclub.myCharacter');
            localStorage.removeItem('vrclub.personalAppearance');
        } catch (error) {
            log.warn('Your character could not be saved:', error);
            this.showErrorMessage('Your character could not be saved on this device.');
            if (hadCustomAvatar) this.setCustomAvatarSelected(true);
            return false;
        }
        this._personalAppearanceLoaded = true;
        this._personalAppearance = null;
        if (mp && mp.client) {
            mp.client.preferredAvatar = next;
            mp.client.setPreferredAppearance?.(null);
        }
        if (mp && mp.connected && mp.selectAvatar(next) === false) {
            if (hadCustomAvatar) this.setCustomAvatarSelected(true);
            return false;
        }
        if (next) this.setLocalAvatarStyle(next[0] === 'm' ? 'male' : 'female');
        this._mirrorSignature = -1;
        if (typeof this._refreshVRQuickMenu === 'function') this._refreshVRQuickMenu();
        if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent('localcharacterchange'));
        return next;
    }

    /** Two fictional CC0 DJs, derived from the guest files, with rigged CC0 headphones. */
    static get DJ_LOOKS() {
        if (!this._djLooks) {
            this._djLooks = Object.freeze({
                male: Object.freeze({
                    url: './js/models/avatars/club-dj-male.glb', height: 1.78,
                    garment: new BABYLON.Color3(0.10, 0.10, 0.12), hair: new BABYLON.Color3(0.12, 0.09, 0.07)
                }),
                female: Object.freeze({
                    url: './js/models/avatars/club-dj-female.glb', height: 1.68,
                    garment: new BABYLON.Color3(0.13, 0.13, 0.15), hair: new BABYLON.Color3(0.85, 0.72, 0.48)
                })
            });
        }
        return this._djLooks;
    }

    /**
     * Every character file the room can show, by index; the crowd and guest slots point at these through
     * `sourceIndex(id)`. Files load on demand per quality tier (see `_requiredCrowdSources`).
     *  - dancerF/dancerM: the UE-rig peasant dancers. Only the player's own body wears them now (AvatarRig).
     *  - bartender: the Quaternius female guest, in a black work outfit through a tint.
     *  - f1..f8, m1..m9: the Modular Women / Modular Men cast built by scripts/build-crowd-glbs.mjs (club-crowd-*.glb):
     *    one draw each, vertex-coloured, the club's own dance and idle clips retargeted onto them.
     *  - vf1..vf7, vm1..vm7: recoloured copies of that cast (other skin, hair and clothes; see VARIANTS in the build script)
     *    so that every person in the club is different. A person appears ONCE: at most one slot per source.
     *  - bouncer: the same build, a man in a black suit, at the street door (see _streetSlots).
     */
    static get AVATAR_SOURCES() {
        if (!this._avatarSources) {
            // Full literal paths on purpose: scripts/build.mjs ships only the model paths it finds written out in the
            // source, so a path assembled from parts would silently be missing from the production build.
            this._avatarSources = Object.freeze([
                { id: 'dancerF', url: './js/models/avatars/club-dancer-female.glb', garmentColor: new BABYLON.Color3(0.45, 0.82, 1.0) },
                { id: 'dancerM', url: './js/models/avatars/club-dancer-male.glb', garmentColor: new BABYLON.Color3(1.0, 0.42, 0.68) },
                // The bartender: the female guest file as its own container, so it can carry a black work outfit
                // without recolouring anyone else.
                { id: 'bartender', url: './js/models/avatars/club-guest-female.glb', garmentColor: new BABYLON.Color3(0.16, 0.16, 0.19) },
                { id: 'f1', url: './js/models/avatars/club-crowd-f1.glb' },
                { id: 'f2', url: './js/models/avatars/club-crowd-f2.glb' },
                { id: 'f3', url: './js/models/avatars/club-crowd-f3.glb' },
                { id: 'f4', url: './js/models/avatars/club-crowd-f4.glb' },
                { id: 'f5', url: './js/models/avatars/club-crowd-f5.glb' },
                { id: 'f6', url: './js/models/avatars/club-crowd-f6.glb' },
                { id: 'f7', url: './js/models/avatars/club-crowd-f7.glb' },
                { id: 'f8', url: './js/models/avatars/club-crowd-f8.glb' },
                { id: 'm1', url: './js/models/avatars/club-crowd-m1.glb' },
                { id: 'm2', url: './js/models/avatars/club-crowd-m2.glb' },
                { id: 'm3', url: './js/models/avatars/club-crowd-m3.glb' },
                { id: 'm4', url: './js/models/avatars/club-crowd-m4.glb' },
                { id: 'm5', url: './js/models/avatars/club-crowd-m5.glb' },
                { id: 'm6', url: './js/models/avatars/club-crowd-m6.glb' },
                { id: 'm7', url: './js/models/avatars/club-crowd-m7.glb' },
                { id: 'm8', url: './js/models/avatars/club-crowd-m8.glb' },
                { id: 'm9', url: './js/models/avatars/club-crowd-m9.glb' },
                // The bouncer at the street door (black suit; carries the guest idle clips). Never a player avatar.
                { id: 'bouncer', url: './js/models/avatars/club-crowd-bouncer.glb' },
                // Recoloured copies of the cast above (scripts/build-crowd-glbs.mjs VARIANTS): other skin, hair and clothes,
                // so no two people in the club are alike. Never player avatars (the relay's pool is f1..m9 only).
                { id: 'vf1', url: './js/models/avatars/club-crowd-vf1.glb' },
                { id: 'vf2', url: './js/models/avatars/club-crowd-vf2.glb' },
                { id: 'vf3', url: './js/models/avatars/club-crowd-vf3.glb' },
                { id: 'vf5', url: './js/models/avatars/club-crowd-vf5.glb' },
                { id: 'vf6', url: './js/models/avatars/club-crowd-vf6.glb' },
                { id: 'vf7', url: './js/models/avatars/club-crowd-vf7.glb' },
                { id: 'vm1', url: './js/models/avatars/club-crowd-vm1.glb' },
                { id: 'vm2', url: './js/models/avatars/club-crowd-vm2.glb' },
                { id: 'vm3', url: './js/models/avatars/club-crowd-vm3.glb' },
                { id: 'vm4', url: './js/models/avatars/club-crowd-vm4.glb' },
                { id: 'vm5', url: './js/models/avatars/club-crowd-vm5.glb' },
                { id: 'vm6', url: './js/models/avatars/club-crowd-vm6.glb' },
                { id: 'vm7', url: './js/models/avatars/club-crowd-vm7.glb' }
            ].map(source => Object.freeze(source)));
        }
        return this._avatarSources;
    }

    /** Index of a source in AVATAR_SOURCES by id, or -1. */
    static sourceIndex(id) {
        return VRClubAudioCrowd.AVATAR_SOURCES.findIndex(source => source.id === id);
    }

    static get BARTENDER_ACTIVITIES() {
        return this._bartenderActivities || (this._bartenderActivities = Object.freeze(['wipe', 'survey', 'arrange', 'wash']));
    }

    /** Local DJ preference, independent of music and the room host. */
    _initialDJId() {
        try {
            const saved = localStorage.getItem('vrclub.questDJ');
            if (saved === 'personal' && this.hasCustomAvatarGlb()) return 'personal';
            if (saved === 'female') return 'female';
        } catch (_) { /* storage blocked */ }
        return 'male';
    }

    async chooseDJ(id) {
        if (id === 'personal' && !this.hasCustomAvatarGlb()) throw new Error('Upload your personal avatar before choosing it as the DJ.');
        if (id !== 'personal' && !VRClubAudioCrowd.djLook(id)) throw new Error('Choose Male DJ or Female DJ.');
        if (!await this.setDJ(id) && this.isPeopleVisible('dj')) throw new Error('The DJ could not load. Try again later.');
        this._djWanted = id;
        try { localStorage.setItem('vrclub.questDJ', id); }
        catch (error) {
            log.warn(`DJ preference could not be saved: ${error.message}`);
            this.showErrorMessage('The DJ changed, but this device could not save your choice.');
        }
        return true;
    }

    /**
     * When a set's metadata unambiguously identifies a male or female DJ, switch the booth DJ to match (`setDJ` only;
     * the guest's saved `vrclub.questDJ` default is left untouched, and uncertain sets leave the current DJ alone).
     */
    syncDJFromSet(info) {
        if (this._djWanted === 'personal') return null;
        const infer = typeof window !== 'undefined' && window.LEDPatterns && typeof window.LEDPatterns.inferSetDjGender === 'function'
            ? window.LEDPatterns.inferSetDjGender
            : null;
        if (!infer) return null;
        const current = this.musicLibrary && typeof this.musicLibrary.current === 'function'
            ? this.musicLibrary.current()
            : null;
        const payload = typeof info === 'object' && info !== null ? info : {
            label: typeof info === 'string' ? info : (this.nowPlayingLabel || ''),
            savedName: (current && current.name) || '',
            url: this._audioStreamUrl || this._soundCloudUrl || (current && current.url) || ''
        };
        const gender = infer(payload);
        if (!gender) return null;
        Promise.resolve(this.setDJ(gender)).catch(() => {});
        const select = typeof document !== 'undefined' && typeof document.getElementById === 'function'
            ? document.getElementById('djStyle')
            : null;
        if (select) select.value = gender;
        return gender;
    }

    /** Load one avatar GLB into a container with its materials normalised. Null when it cannot be loaded. */
    async _loadAvatarSource(url, garmentColor = null, hairColor = null) {
        let container = null;
        try {
            if (this._disposed) return null;
            container = await this.modelLoader.loadAssetContainer(url, this.scene);
            if (this._disposed) {
                container.dispose();
                return null;
            }
            // Babylon's glTF loader starts the file's first clip on the SOURCE skeleton, even in a container nothing draws, and it
            // loops there for ever: every frame the scene evaluated ~2,200 animatables (about 17 source files) that no one could
            // see. The instantiated characters start their own cloned groups, so the sources' can simply be stopped.
            for (const group of container.animationGroups) group.stop();
            const person = window.CharacterCatalog && Object.values(window.CharacterCatalog.people).find(item => item.url === url);
            if (person) for (const material of container.materials) material._vrclubCharacterHair = material.name.endsWith('_hair');
            this._prepareAvatarMaterials(container.materials, garmentColor, hairColor);
            container.character = person || null;
            container.characterSourceId = person
                ? Object.keys(window.CharacterCatalog.npcs).find(id => window.CharacterCatalog.people[window.CharacterCatalog.npcs[id]] === person)
                : VRClubAudioCrowd.AVATAR_SOURCES.find(source => source.url === url)?.id;
            this._restoreLightBudgets();
            this._avatarContainers.push(container);
            return container;
        } catch (error) {
            if (container) container.dispose();
            log.warn(`  ❌ Failed to load avatar source ${url}: ${error.message}`);
            return null;
        }
    }

    /**
     * The glTF loader raises EVERY material in the scene to the scene's light count when a file lands (even into a
     * container), so a load after start-up (a DJ swap, a tier top-up, the people outside the street door) left the club's
     * and the street's lit materials asking for more lights than the device binds. Put back only the ones it changed, so
     * nothing else recompiles.
     */
    _restoreLightBudgets() {
        const scene = this.scene;
        if (!scene || !scene.materials || !Number.isFinite(this.maxLights)) return;
        const blocked = scene.blockMaterialDirtyMechanism;
        scene.blockMaterialDirtyMechanism = false;
        for (const material of scene.materials) {
            if (material.maxSimultaneousLights === undefined || material.disableLighting) continue;
            if (material.maxSimultaneousLights === this.maxLights) continue;
            if (material.isFrozen) material.unfreeze();
            material.maxSimultaneousLights = this.maxLights;
            if (material.markAsDirty) material.markAsDirty(BABYLON.Material.LightDirtyFlag);
        }
        scene.blockMaterialDirtyMechanism = blocked;
    }

    /**
     * Put the DJ for `id` ('male' | 'female') behind the decks. Swaps are queued, so a quick double switch
     * ends on the last one, and the first call loads the file (each DJ is loaded once and kept).
     * @returns {Promise<boolean>} true when the requested DJ is at the decks
     */
    /** The look for a DJ id, or null (an own key only: `__proto__` and `constructor` are not DJs). */
    static djLook(id) {
        const looks = VRClubAudioCrowd.DJ_LOOKS;
        return typeof id === 'string' && Object.prototype.hasOwnProperty.call(looks, id) ? looks[id] : null;
    }

    setDJ(id) {
        if (id === 'personal' ? !this.hasCustomAvatarGlb() : !VRClubAudioCrowd.djLook(id)) return Promise.resolve(false);
        // A selection during startup waits for init, which places the initial DJ itself.
        this._djQueue = (this._djQueue || Promise.resolve(this.initPromise).catch(() => {}))
            .then(() => (this._disposed ? false : this._applyDJ(id)))
            .catch(error => {
                log.warn('Could not change the resident DJ:', error);
                this.showErrorMessage('The resident DJ could not be changed. Try again.');
                return false;
            });
        return this._djQueue;
    }

    async _applyDJ(id) {
        const style = this.getCharacterStyle();
        const look = id === 'personal' ? { height: 1.7 / 0.93, personal: true } : this._characterDJLook(id, style);
        if (!look) return false;
        const previousWanted = this._djWanted;
        this._djWanted = id;
        // Sent home: remember the local choice and fetch nothing until the DJ is asked back.
        if (!this.isPeopleVisible('dj')) return false;
        if (this._djId === id && this._djCharacterStyle === style) return true;
        this._djContainers = this._djContainers || {};
        const key = `${style}:${id}`;
        if (id !== 'personal' && !this._djContainers[key]) this._djContainers[key] = await this._loadCharacterContainer(look, style);
        const container = id === 'personal' ? this._customAvatarContainer : this._djContainers[key];
        if (style !== this.getCharacterStyle()) return false;
        if (!container || this._disposed) return false;

        const previousNPC = this.npcAvatars.find(npc => npc.name === 'djPerformer');
        const personalEntry = id === 'personal' ? this._spawnPerformingDJ(container, look) : null;
        if (id === 'personal' && !personalEntry) {
            this._djWanted = previousWanted;
            this.showErrorMessage('Your avatar cannot be posed as a resident DJ. Choose a compatible humanoid model.');
            return false;
        }
        // The previous DJ leaves: skeleton, clip, collider and all.
        const previous = previousNPC ? this.npcAvatars.indexOf(previousNPC) : -1;
        if (previous >= 0) {
            const npc = this.npcAvatars[previous];
            if (npc.collider) { try { npc.collider.dispose(); } catch (_) { /* ignore */ } }
            if (this._djEntry) { try { this._djEntry.dispose(); } catch (_) { /* ignore */ } }
            this.npcAvatars.splice(previous, 1);
        }
        if (id !== 'personal') {
            this._djRig = null;
            this._djPerformer = null;
        }
        this._djEntry = personalEntry || this._spawnPerformingDJ(container, look)
            || this._spawnAvatar(container, 'djPerformer', new BABYLON.Vector3(0, 0.5, -19.4), 0, look.height, 0.55, { clip: 'Idle_Loop' });
        this._djId = id;
        this._djCharacterStyle = style;
        if (this.performingAsDJ) this._applyDJVisibility();
        if (this._refreshContactShadows) this._refreshContactShadows();
        if (this._refreshShadowCasters) this._refreshShadowCasters();
        return true;
    }

    _avatarContainerFor(style) {
        if (this.isCustomAvatarSelected()) return this._customAvatarContainer;
        const list = this._crowdSourceContainers;
        if (!list) return null;
        return (style === 'male' ? list[1] : list[0]) || list[0] || list[1] || null;
    }

    static CUSTOM_AVATAR_CACHE_KEY = 'local://custom-avatar.glb';
    static CUSTOM_AVATAR_MAX_BYTES = 30 * 1024 * 1024;

    hasCustomAvatarGlb() {
        return !!(this._customAvatarContainer && !this._disposed);
    }

    isCustomAvatarSelected() {
        return this.hasCustomAvatarGlb() && this._customAvatarSelected !== false;
    }

    setCustomAvatarSelected(selected) {
        if (!this.hasCustomAvatarGlb()) {
            this.showErrorMessage('Upload a personal avatar first.');
            return false;
        }
        selected = !!selected;
        if (selected === this.isCustomAvatarSelected()) return true;
        const list = this._crowdSourceContainers;
        const style = this.getLocalAvatarStyle();
        const source = selected ? this._customAvatarContainer
            : list && ((style === 'male' ? list[1] : list[0]) || list[0] || list[1]);
        if (!source) {
            this.showErrorMessage('Your club body is not ready yet. Try again.');
            return false;
        }
        let rig;
        try {
            rig = new AvatarRig(this, source, {
                eyeHeight: this._bodyEyeHeight(), hideHead: !this.performingAsDJ, allowFallback: selected
            });
            if (selected && rig.ok) window.CustomAvatarAppearance.apply(rig, this.getCustomAvatarAppearance());
        } catch (error) {
            rig?.dispose();
            log.warn('Could not create the selected character:', error);
            this.showErrorMessage('That character could not be loaded.');
            return false;
        }
        if (!rig.ok) {
            rig.dispose();
            this.showErrorMessage('That character could not be loaded.');
            return false;
        }
        try {
            localStorage.setItem('vrclub.customAvatarSelected', selected ? '1' : '0');
        } catch (error) {
            rig.dispose();
            log.warn('Your personal avatar selection could not be saved:', error);
            this.showErrorMessage('Your character selection could not be saved on this device.');
            return false;
        }
        if (this._localRig) this._localRig.dispose();
        this._localRig = rig;
        this._customAvatarSelected = selected;
        this._uploadedAvatarSharing().sync();
        this._syncMirrorDouble();
        if (typeof this._syncRestroomMirrorRenderList === 'function') this._syncRestroomMirrorRenderList();
        if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('customavatarchange'));
        }
        if (typeof this._refreshVRQuickMenu === 'function') this._refreshVRQuickMenu();
        return true;
    }

    getCustomAvatarName() {
        return this._customAvatarName || null;
    }

    getCustomAvatarAppearance() {
        if (!this._customAppearance) {
            let saved;
            try {
                saved = localStorage.getItem('vrclub.customAvatarAppearance');
                this._customAppearance = saved ? window.CustomAvatarAppearance.sanitize(JSON.parse(saved))
                    : window.CustomAvatarAppearance.defaults();
            } catch (error) {
                log.warn('Could not read uploaded-avatar clothing:', error);
                this.showErrorMessage('Saved uploaded-avatar clothing could not be read. Original clothing is retained.');
                this._customAppearance = window.CustomAvatarAppearance.defaults();
            }
        }
        return this._customAppearance;
    }

    setCustomAvatarAppearance(value) {
        const next = window.CustomAvatarAppearance.sanitize(value);
        const previous = this.getCustomAvatarAppearance();
        const rigs = [this.isCustomAvatarSelected() ? this._localRig : null,
            this._djId === 'personal' ? this._djRig : null].filter(Boolean);
        try {
            for (const rig of rigs) window.CustomAvatarAppearance.apply(rig, next);
            localStorage.setItem('vrclub.customAvatarAppearance', JSON.stringify(next));
        } catch (error) {
            for (const rig of rigs) window.CustomAvatarAppearance.apply(rig, previous);
            throw error;
        }
        this._customAppearance = next;
        this._uploadedAvatarSharing().sync();
        window.dispatchEvent(new CustomEvent('customavatarchange'));
        this._refreshVRQuickMenu?.();
        return next;
    }

    _uploadedAvatarSharing() {
        if (!this._avatarSharing) this._avatarSharing = new window.UploadedAvatarSharing(this);
        return this._avatarSharing;
    }

    setCustomAvatarSharing(enabled) {
        this._uploadedAvatarSharing().setEnabled(enabled);
    }

    customAvatarSharingStatus() {
        return this._uploadedAvatarSharing().status();
    }

    _customAvatarCache() {
        if (!this._fallbackAvatarCache && typeof IndexedDBAssetCache !== 'undefined') {
            this._fallbackAvatarCache = new IndexedDBAssetCache({
                dbName: 'VRClubCustomAvatar', storeName: 'avatars', maxAgeMs: 0
            });
        }
        return this._fallbackAvatarCache || null;
    }

    /**
     * Load a user-supplied `.glb` avatar (Ready Player Me, Tribe XR, Mixamo, VRM, or custom),
     * bind it to `AvatarRig` for walking, sitting, mirror reflection, and `DJPerformer` in the booth,
     * and persist it locally on this device.
     */
    async loadCustomAvatarGlb(input, name = '', options = {}) {
        if (this._disposed || !this.scene || typeof BABYLON === 'undefined' || !BABYLON.SceneLoader) {
            throw new Error('Scene is not ready yet.');
        }
        if (this._customAvatarContainer && (this._djWanted === 'personal' || this._djId === 'personal')) {
            throw new Error('Choose another resident DJ before replacing your personal avatar. If the DJ is away, bring them back first.');
        }
        const revision = this._customAvatarRevision = (this._customAvatarRevision || 0) + 1;
        let buffer = null;
        const label = String(name || (input && input.name) || 'Custom avatar.glb').trim() || 'Custom avatar.glb';
        if (input instanceof ArrayBuffer) {
            buffer = input;
        } else if (ArrayBuffer.isView(input)) {
            buffer = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
        } else if (input && typeof input.arrayBuffer === 'function') {
            buffer = await input.arrayBuffer();
        }
        if (!buffer || !(buffer.byteLength >= 20)) {
            throw new Error('Please choose a valid .glb 3D avatar file.');
        }
        if (buffer.byteLength > VRClubAudioCrowd.CUSTOM_AVATAR_MAX_BYTES) {
            throw new Error('This .glb file is larger than 30 MB. Please use a lighter avatar.');
        }
        const magic = new DataView(buffer).getUint32(0, true);
        if (magic !== 0x46546C67) {
            throw new Error('This file is not a binary .glb model (missing glTF header).');
        }

        const blobUrl = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
        let container = null;
        try {
            container = await BABYLON.SceneLoader.LoadAssetContainerAsync('', blobUrl, this.scene, null, '.glb');
        } finally {
            try { URL.revokeObjectURL(blobUrl); } catch (_) { /* ignore */ }
        }
        if (!container || this._disposed || revision !== this._customAvatarRevision) {
            if (container) { try { container.dispose(); } catch (_) { /* ignore */ } }
            throw new Error('Avatar loading was cancelled or replaced.');
        }

        if (this._prepareAvatarMaterials && container.materials) {
            this._prepareAvatarMaterials(container.materials, null);
        }
        if (container.materials) {
            for (let i = 0; i < container.materials.length; i++) {
                const mat = container.materials[i];
                if (!mat) continue;
                mat.maxSimultaneousLights = this.maxLights || 3;
                mat.disableDepthWrite = false;
                if (typeof mat.unfreeze === 'function') mat.unfreeze();
                if (typeof mat.markAsDirty === 'function' && BABYLON.Material) {
                    mat.markAsDirty(BABYLON.Material.LightDirtyFlag);
                }
            }
        }
        if (this._restoreLightBudgets) this._restoreLightBudgets();

        let rig;
        try {
            rig = new AvatarRig(this, container, {
                eyeHeight: this._bodyEyeHeight(),
                hideHead: !this.performingAsDJ,
                allowFallback: true
            });
        } catch (error) {
            container.dispose();
            throw error;
        }
        if (!rig.ok) {
            rig.dispose();
            try { container.dispose(); } catch (_) { /* ignore */ }
            throw new Error('Could not bind this .glb model as an avatar.');
        }
        try { window.CustomAvatarAppearance.apply(rig, this.getCustomAvatarAppearance()); }
        catch (error) { rig.dispose(); container.dispose(); throw error; }

        let selected = true;
        let selectionPersisted = true;
        if (options.persist === false) {
            try { selected = localStorage.getItem('vrclub.customAvatarSelected') !== '0'; }
            catch (error) {
                selectionPersisted = false;
                log.warn('Could not read your personal avatar selection:', error);
                this.showErrorMessage('Your personal avatar selection could not be read on this device.');
            }
        }
        if (selected && this._localRig) {
            try { this._localRig.dispose(); } catch (_) { /* ignore */ }
            this._localRig = null;
        }
        if (this._customAvatarContainer && this._customAvatarContainer !== container) {
            try { this._customAvatarContainer.dispose(); } catch (_) { /* ignore */ }
        }
        this._customAvatarContainer = container;
        this._customAvatarBytes = buffer;
        this._customAvatarName = label;
        this._customAvatarSelected = selected;
        if (selected) this._localRig = rig;
        else rig.dispose();

        let persisted = options.persist === false;
        if (options.persist !== false) {
            try { localStorage.setItem('vrclub.customAvatarSelected', '1'); }
            catch (error) {
                selectionPersisted = false;
                log.warn('Could not save your personal avatar selection:', error);
                this.showErrorMessage('Your personal avatar selection could not be saved on this device.');
            }
            const cache = this._customAvatarCache();
            if (cache) {
                await cache.init();
                if (this._disposed) cache.close();
                if (this._disposed || revision !== this._customAvatarRevision) throw new Error('Avatar loading was cancelled or replaced.');
                if (cache.db && !cache.disabled) {
                    try {
                        await cache._run('readwrite', store => store.put({
                            url: VRClubAudioCrowd.CUSTOM_AVATAR_CACHE_KEY, payload: buffer,
                            meta: { name: label }, timestamp: Date.now()
                        }));
                        persisted = true;
                    } catch (error) {
                        log.warn('Could not save custom avatar:', error);
                    }
                }
            }
        }
        if (this._disposed || revision !== this._customAvatarRevision) throw new Error('Avatar loading was cancelled or replaced.');
        this._customAvatarPersisted = persisted;
        this._uploadedAvatarSharing().sync();

        if (typeof this._syncMirrorDouble === 'function') this._syncMirrorDouble();
        if (typeof this._syncRestroomMirrorRenderList === 'function') this._syncRestroomMirrorRenderList();
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('customavatarchange', {
                detail: { active: true, name: label, rigMode: rig.rigMode }
            }));
        }
        return { ok: true, name: label, rigMode: rig.rigMode, persisted, selectionPersisted };
    }

    async clearCustomAvatarGlb() {
        if (this._djWanted === 'personal' || this._djId === 'personal') {
            throw new Error('Choose another resident DJ before removing your personal avatar. If the DJ is away, bring them back first.');
        }
        const revision = this._customAvatarRevision = (this._customAvatarRevision || 0) + 1;
        const cache = this._customAvatarCache();
        if (cache) {
            await cache.init();
            if (this._disposed) cache.close();
            if (this._disposed || revision !== this._customAvatarRevision) throw new Error('Avatar removal was cancelled or replaced.');
            if (cache.db && !cache.disabled) {
                await cache._run('readwrite', store => store.delete(VRClubAudioCrowd.CUSTOM_AVATAR_CACHE_KEY));
            } else {
                throw new Error('Browser storage is unavailable. The saved avatar could not be removed.');
            }
        }
        if (this._disposed || revision !== this._customAvatarRevision) throw new Error('Avatar removal was cancelled or replaced.');
        const wasSelected = this.isCustomAvatarSelected();
        this._customAvatarName = null;
        this._customAvatarPersisted = false;
        this._customAvatarSelected = false;
        this._customAvatarBytes = null;
        this._uploadedAvatarSharing().sync();
        if (wasSelected && this._localRig) {
            try { this._localRig.dispose(); } catch (_) { /* ignore */ }
            this._localRig = null;
        }
        if (this._customAvatarContainer) {
            try { this._customAvatarContainer.dispose(); } catch (_) { /* ignore */ }
            this._customAvatarContainer = null;
        }
        if (wasSelected) this._spawnLocalPlayerBody();
        if (typeof this._syncMirrorDouble === 'function') this._syncMirrorDouble();
        if (typeof this._syncRestroomMirrorRenderList === 'function') this._syncRestroomMirrorRenderList();
        if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('customavatarchange', {
                detail: { active: false, name: null, rigMode: null }
            }));
        }
        return true;
    }

    async _restoreCustomAvatarGlb() {
        const cache = this._customAvatarCache();
        if (!cache) return false;
        const revision = this._customAvatarRevision || 0;
        try {
            await cache.init();
            if (this._disposed) { cache.close(); return false; }
            if (!cache.db || cache.disabled) return false;
            const record = await cache._run('readonly', store => store.get(VRClubAudioCrowd.CUSTOM_AVATAR_CACHE_KEY));
            if (!record || this.hasCustomAvatarGlb() || this._disposed ||
                revision !== (this._customAvatarRevision || 0)) return false;
            await this.loadCustomAvatarGlb(record.payload, record.meta?.name, { persist: false });
            if (localStorage.getItem('vrclub.questDJ') === 'personal' && !await this.setDJ('personal') && this.isPeopleVisible('dj')) {
                this.showErrorMessage('Your personal DJ could not be restored. Choose another DJ or try again.');
            }
            if (typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
                window.dispatchEvent(new CustomEvent('customavatarchange'));
            }
            return true;
        } catch (err) {
            log.warn('⚠️ Could not restore saved custom .glb avatar:', err);
            this.showErrorMessage('Could not restore your saved avatar. Choose the file again.');
            return false;
        }
    }

    // ───────────────────────── the DJ, performing ─────────────────────────
    //
    // The DJ files carry one idle clip. A performing DJ is an AvatarRig (the player-body driver) whose pose comes from
    // DJPerformer every frame: mixing, cueing in the headphones, looking at the crowd, hands up on a drop, pointing at a
    // visitor, nodding and bouncing on the beat. If the rig cannot drive the file, the idle clip stays (the caller).

    /** The controller on the DJ table, measured from the scene, with the numbers it had when this was written as fallback. */
    _djDesk() {
        const mesh = this.scene && this.scene.getMeshByName && this.scene.getMeshByName('console_final');
        if (mesh && mesh.isEnabled()) {
            mesh.computeWorldMatrix(true);
            const box = mesh.getBoundingInfo().boundingBox;
            return {
                cx: (box.minimumWorld.x + box.maximumWorld.x) / 2,
                near: box.minimumWorld.z, far: box.maximumWorld.z,
                top: box.maximumWorld.y, halfWidth: (box.maximumWorld.x - box.minimumWorld.x) / 2
            };
        }
        return { cx: 0, near: -18.89, far: -18.35, top: 1.54, halfWidth: 0.51 };
    }

    /** @returns {{dispose: function}|null} the DJ, or null when the rig cannot drive this file */
    _spawnPerformingDJ(container, look) {
        if (typeof AvatarRig === 'undefined' || typeof DJPerformer === 'undefined') return null;
        // Eyes ~93% of the standing height (the height includes hair and headphones).
        const eyeHeight = look.height * 0.93;
        const rig = new AvatarRig(this, container, { eyeHeight, allowCustomSkeleton: !!look.personal, djPointing: true });
        if (!rig.ok) { rig.dispose(); return null; }
        if (look.personal) window.CustomAvatarAppearance.apply(rig, this.getCustomAvatarAppearance());
        rig.root.name = 'djPerformer';
        const desk = this._djDesk();
        // Close behind the table: the arms (~0.49 m shoulder to wrist) reach the controller's near half only when the
        // eyes are ~0.18 m behind its edge and the DJ leans in; the hips then stay behind the table (z -19). The old
        // idle DJ stood 0.5 m further back, out of reach. The riser's top is 0.5 m.
        const performer = new DJPerformer({ x: desk.cx, z: desk.near - 0.18, groundY: 0.5, eyeHeight, desk });
        rig.update(1 / 60, performer.update(1 / 60, { hasAudio: false }, null));
        const npc = {
            name: 'djPerformer', root: rig.root, meshes: rig.meshes, animations: [], baseSpeed: 1,
            reactsToBeat: false, homeYaw: null, avoidYaw: 0
        };
        npc.collider = this._attachOccupantCollider(rig.root, 'djPerformer');
        if (npc.collider) npc.collider.position.set(desk.cx, 0.5 + 0.85, desk.near - 0.45);
        this.npcAvatars.push(npc);
        this._djRig = rig;
        npc.rig = rig;
        npc.character = container.character || null;
        npc.characterSourceId = `dj-${this._djWanted || this._initialDJId()}`;
        this._djPerformer = performer;
        this._djMusic = { hasAudio: false, beatPhase: 0, bar: 0, energy: 0, drop: false, bpm: 120 };
        this._djVisitors = [];
        this._djLastSetPiece = null;
        this._djLastMovement = null;
        return { dispose: () => { rig.dispose(); if (this._djRig === rig) { this._djRig = null; this._djPerformer = null; } } };
    }

    /** Per frame: tell the DJ where the music is and who is near, then pose the rig. */
    _updateDJ(dt, audioData) {
        const rig = this._djRig, performer = this._djPerformer;
        if (!this.performingAsDJ && (!rig || !rig.ok || !performer || !rig.root || !rig.root.isEnabled())) return;
        const music = this._djMusic || (this._djMusic = { hasAudio: false, beatPhase: 0, bar: 0, energy: 0, drop: false, bpm: 120 });
        const vj = this.vjDirector, show = this.showDirector;
        const fallback = this._unanalysedDanceMusic();
        music.bpm = (vj && vj.bpm) || 120;
        if (this._audioKind === 'soundcloud') {
            this._djAudioUntil = 0;
            music.hasAudio = !!fallback;
        } else {
            const now = performance.now();
            const audible = !!(audioData && audioData.hasAudio);
            if (audible) this._djAudioUntil = now + Math.max(1000, 2 * 60000 / music.bpm);
            music.hasAudio = audible || now < (this._djAudioUntil || 0);
        }
        // Beat phase inside the beat, from the bar phase (0..1 over four beats).
        const barPhase = Number.isFinite(this.barPhase) ? this.barPhase : 0;
        music.beatPhase = (barPhase * 4) % 1;
        music.bar = vj ? Math.floor(vj.beatNumber / 4) : 0;
        const localPresence = Number.isFinite(this._localPaPresence) ? this._localPaPresence : 1;
        music.energy = (audioData && typeof audioData.energy === 'number' ? audioData.energy
            : (show && Number.isFinite(show._energy) ? Math.min(1, show._energy / 0.45) : 0.5)) * localPresence;
        // A drop: the show's release set-piece starting, or it entering IGNITION.
        let drop = false;
        if (show) {
            const piece = show._setPiece ? show._setPiece.title : null;
            if (piece !== this._djLastSetPiece) {
                if (show._setPiece === show.setPieces.release) drop = true;
                this._djLastSetPiece = piece;
            }
            if (show._movementName !== this._djLastMovement) {
                if (show._movementName === 'ignition' && this._djLastMovement !== null) drop = true;
                this._djLastMovement = show._movementName;
            }
        }
        music.drop = drop;
        if (this._audioKind === 'soundcloud') {
            music.drop = false;
            if (fallback) {
                music.bpm = fallback.bpm;
                music.beatPhase = fallback.beat % 1;
                music.bar = Math.floor(fallback.beat / 4);
                music.energy = 0.55 * localPresence;
            }
        }
        // Who might walk up to the booth: this guest, and the other people in the room.
        const visitors = this._djVisitors || (this._djVisitors = []);
        visitors.length = 0;
        const cam = this._playerCamera();
        const pos = cam && (cam.globalPosition || cam.position);
        if (pos && !this.performingAsDJ) {
            const me = this._djMe || (this._djMe = { x: 0, z: 0, id: 'me' });
            me.x = pos.x; me.z = pos.z;
            visitors.push(me);
        }
        if (this.avatarManager && this.avatarManager.remotes) {
            for (const peer of this.avatarManager.remotes.values()) {
                if (!peer.root || peer.hidden) continue;
                const v = peer._djVisitor || (peer._djVisitor = { x: 0, z: 0, id: peer.id });
                v.x = peer.root.position.x; v.z = peer.root.position.z;
                visitors.push(v);
            }
        }
        if (this.performingAsDJ && typeof DJPerformer !== 'undefined') {
            const desk = this._djDesk();
            const eyeHeight = this._shownBodyEye ? this._shownBodyEye() : 1.7;
            if (!this._selfDJPerformer) {
                this._selfDJPerformer = new DJPerformer({ x: desk.cx, z: desk.near - 0.18, groundY: 0.5, eyeHeight, desk });
            } else {
                this._selfDJPerformer.desk = desk;
                this._selfDJPerformer.home.x = desk.cx;
                this._selfDJPerformer.home.z = desk.near - 0.18;
                this._selfDJPerformer.eye = eyeHeight;
            }
            if (!this._djMusic) {
                this._djMusic = { hasAudio: false, beatPhase: 0, bar: 0, energy: 0, drop: false, bpm: 120 };
            }
            this._selfDJPose = this._selfDJPerformer.update(dt, music, visitors);
            if (typeof this._updateMirrorDouble === 'function') this._updateMirrorDouble(dt);
            return;
        }
        if (!rig || !rig.ok || !performer || !rig.root || !rig.root.isEnabled()) return;
        rig.update(dt, performer.update(dt, music, visitors));
    }

    /**
     * Put the local player's own avatar behind the Pioneer console in the DJ booth, driven by `DJPerformer`
     * (jog-wheel mixing, knob tweaking, headphone cueing, beat bounce and drop hands-up) while hiding the
     * resident NPC DJ and broadcasting the live DJ hand poses to everyone in the room.
     */
    setPerformingAsDJ(on, options = {}) {
        const next = !!on;
        if (Boolean(this.performingAsDJ) === next && !options.force) return next;
        this.performingAsDJ = next;
        if (next) {
            const desk = this._djDesk();
            const eyeHeight = this._shownBodyEye ? this._shownBodyEye() : 1.7;
            if (!this._selfDJPerformer && typeof DJPerformer !== 'undefined') {
                this._selfDJPerformer = new DJPerformer({ x: desk.cx, z: desk.near - 0.18, groundY: 0.5, eyeHeight, desk });
            }
            if (!this._djMusic) {
                this._djMusic = { hasAudio: false, beatPhase: 0, bar: 0, energy: 0, drop: false, bpm: 120 };
            }
            if (this._selfDJPerformer) {
                this._selfDJPose = this._selfDJPerformer.update(1 / 60, this._djMusic, null);
            }
            if (typeof this._syncMirrorDouble === 'function') this._syncMirrorDouble();
            this._applyDJVisibility();
            if (options.moveCamera !== false) this._showPerformingDJView();
        } else {
            this._selfDJPose = null;
            if (this._localRig && typeof this._localRig.setHeadVisible === 'function') {
                this._localRig.setHeadVisible(false);
            } else if (this._localRig && this._localRig.headMeshes) {
                this._localRig.headMeshes.forEach(m => { m.isVisible = false; });
            }
            if (typeof this._syncMirrorDouble === 'function') this._syncMirrorDouble();
            this._applyDJVisibility();
        }
        return next;
    }

    _showPerformingDJView() {
        if (this.performingAsDJ && !this.isInVRMode && this.camera) this.moveCameraToPreset('djBooth');
    }

    _playerCamera() {
        return (this.isInVRMode && this.vrHelper && this.vrHelper.baseExperience && this.vrHelper.baseExperience.camera)
            || this.camera
            || (this.scene && this.scene.activeCamera);
    }

    _spawnLocalPlayerBody() {
        if (this._localRig || typeof AvatarRig === 'undefined') return;
        const container = this._avatarContainerFor(this.getLocalAvatarStyle());
        if (!container) return;
        // The body is the player's own height in the headset once it is known (measured, or estimated while standing),
        // otherwise the standard 1.7 m one; desktop is always 1.7 m because its camera is. Sitting on the club's
        // furniture or in Seated mode never shrinks it: a seated guest keeps a standing person, and Seated mode lifts
        // the view to it (`_xrHeadHeight`).
        const rig = new AvatarRig(this, container, {
            eyeHeight: this._bodyEyeHeight(),
            hideHead: true,
            allowFallback: this.isCustomAvatarSelected()
        });
        if (rig.ok && this.isCustomAvatarSelected()) window.CustomAvatarAppearance.apply(rig, this.getCustomAvatarAppearance());
        this._localRig = rig.ok ? rig : null;
    }

    /** Eye height of the local body, and of the person others see: the player's own in VR, 1.7 m on desktop. */
    _bodyEyeHeight() {
        const H = window.PlayerHeight;
        const standard = H ? H.DEFAULT_EYE : 1.7;
        return this.isInVRMode && this.playerEyeHeight ? this.playerEyeHeight : standard;
    }

    /**
     * The height the local body is drawn at: `_bodyEyeHeight()` approached at 0.3 m/s, so a measured height, entering VR or
     * leaving it grows or shrinks the person over about a second instead of jumping (the first call, and a rig that
     * has not been fitted yet, start there).
     */
    _easedBodyEyeHeight(dt) {
        const target = this._bodyEyeHeight();
        let shown = this._bodyEyeShown;
        if (!Number.isFinite(shown) || !(dt > 0)) shown = target;
        else {
            const step = 0.3 * Math.min(dt, 0.1);
            shown = Math.abs(target - shown) <= step ? target : shown + Math.sign(target - shown) * step;
        }
        this._bodyEyeShown = shown;
        return shown;
    }

    /** The eased height the local body is drawn at right now (the target until the body has run once). */
    _shownBodyEye() {
        return Number.isFinite(this._bodyEyeShown) ? this._bodyEyeShown : this._bodyEyeHeight();
    }

    /** One controller's hand pose into a reusable object, or null when untracked. */
    _handPose(side, head) {
        const hand = side === 'left' ? (this._handL || (this._handL = {})) : (this._handR || (this._handR = {}));
        const ctrls = this._xrControllers;
        for (let i = 0; i < ctrls.length; i++) {
            const c = ctrls[i];
            if (!c || !c.inputSource || c.inputSource.handedness !== side) continue;
            const grip = c.grip || c.pointer, aim = c.pointer || c.grip;
            if (!grip || !aim) return null;
            const p = grip.getAbsolutePosition();
            // An untracked controller sits at the origin or far from the head; reaching
            // for it would drag the arm across the room.
            const dx = p.x - head.x, dy = p.y - head.y, dz = p.z - head.z;
            if ((p.x === 0 && p.y === 0 && p.z === 0) || dx * dx + dy * dy + dz * dz > 2.25) return null;
            const dir = this._handDir || (this._handDir = new BABYLON.Vector3());
            hand.x = p.x; hand.y = p.y; hand.z = p.z;
            aim.getDirectionToRef(BABYLON.Axis.Z, dir);
            hand.fx = dir.x; hand.fy = dir.y; hand.fz = dir.z;
            aim.getDirectionToRef(BABYLON.Axis.Y, dir);
            hand.ux = dir.x; hand.uy = dir.y; hand.uz = dir.z;
            // Holding a knob or the crossfader: the hand goes onto it (the palm 7 cm short of the cap, fingers along the
            // controller's own direction, so the wrist twist still turns the hand), instead of hovering where the ray starts.
            const held = this._vjDeskHandHold && this._vjDeskHandHold[side];
            if (held && held.amount > 0) {
                hand.x += (held.x - hand.fx * 0.07 - hand.x) * held.amount;
                hand.y += (held.y - hand.fy * 0.07 - hand.y) * held.amount;
                hand.z += (held.z - hand.fz * 0.07 - hand.z) * held.amount;
            }
            return hand;
        }
        return null;
    }

    /** Walking away from a seat stands you up (the camera leaves the seat's spot): independent of which body is drawn. */
    _releaseSeatWhenAway() {
        const seat = this._activeSeat;
        if (!seat) return;
        const cam = this._playerCamera();
        const pos = cam && (cam.globalPosition || cam.position);
        if (pos && Math.hypot(pos.x - seat.viewX, pos.z - seat.viewZ) > 0.75) this.standFromSeat(false);
    }

    _updateLocalPlayerBody(dt) {
        // The eased body height drives whichever body is shown (the character's scale, or the mannequin's fit).
        const eye = this._easedBodyEyeHeight(dt);
        // Every body needs this, so it cannot live in the mannequin's own update (a character body used to stay on the couch).
        this._releaseSeatWhenAway();
        const rig = this._localRig;
        if (!rig || !rig.ok) return;
        // When the player has a character (the one in the mirror), THAT is their body: the procedural mannequin stays hidden
        // and idle, and takes over again (from where the player now stands) when there is no character to show.
        const character = this._mirrorDouble;
        if (character && character.shown) {
            if (!rig._standsDown) {
                rig._standsDown = true;
                rig.meshes.forEach(mesh => mesh.setEnabled(false));
            }
            return;
        }
        if (rig._standsDown) {
            rig._standsDown = false;
            rig._placed = false;
            rig.meshes.forEach(mesh => mesh.setEnabled(true));
        }
        const cam = this._playerCamera();
        const pos = cam && (cam.globalPosition || cam.position);
        if (!pos) return;
        if (this.performingAsDJ && this._selfDJPose) {
            const djPose = this._selfDJPose;
            rig.setEyeHeight(eye);
            const away = Math.hypot(djPose.x - pos.x, (djPose.eyeY || 2.1) - pos.y, djPose.z - pos.z);
            if (typeof rig.setHeadVisible === 'function') rig.setHeadVisible(away > 0.35);
            else if (rig.headMeshes) rig.headMeshes.forEach(m => { m.isVisible = away > 0.35; });
            rig.update(dt, djPose);
            return;
        }
        if (typeof rig.setHeadVisible === 'function') rig.setHeadVisible(false);
        else if (rig.headMeshes) rig.headMeshes.forEach(m => { m.isVisible = false; });
        const pose = this._localPose || (this._localPose = {
            x: 0, z: 0, groundY: 0, eyeY: 1.7, headYaw: 0, headPitch: 0, left: null, right: null
        });
        const dir = this._localDir || (this._localDir = new BABYLON.Vector3());
        cam.getDirectionToRef(BABYLON.Axis.Z, dir);
        pose.headYaw = Math.atan2(dir.x, dir.z);
        pose.headPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
        const seat = this._activeSeat;
        pose.x = seat ? seat.x : pos.x;
        pose.z = seat ? seat.z : pos.z;
        pose.groundY = seat ? seat.floorY : ((pos.x > -3 && pos.x < 3 && pos.z < -16 && pos.z > -20.5) ? 0.5 : (this._walkLevel || 0));
        rig.setEyeHeight(eye);   // refits only when it differs by 4 cm or more
        pose.eyeY = pose.groundY + (rig.standEye || 1.7);
        pose.seated = !!seat;
        pose.seatY = seat ? seat.seatY : 0;
        pose.bodyYaw = seat ? seat.facing : pose.headYaw;
        if (this.isInVRMode) {
            pose.left = this._handPose('left', pos);
            pose.right = this._handPose('right', pos);
        } else {
            pose.left = null; pose.right = null;
        }
        rig.update(dt, pose);
    }
}
window.VRClubAvatars = VRClubAvatars;
