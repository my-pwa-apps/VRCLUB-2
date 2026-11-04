'use strict';

class VRClubCrowd extends window.VRClubAvatars {
    async createDancingNPCs() {
        // === CROWD + DJ ===
        // The crowd is built by loading each source file ONCE into an AssetContainer and then
        // instantiating it per dancer. That gives every dancer its own skeleton and
        // animation group (so nobody moves in lockstep) off a single download and a
        // single set of geometry buffers and materials.
        const crowdSize = Math.max(0, this.tierSettings.crowdSize | 0);
        const at = id => VRClubAudioCrowd.sourceIndex(id);

        // Hand-placed rather than randomised: the list is ordered so that the first
        // N slots are already well spread AND varied (men and women, every skin tone, silver heads, the punks), which
        // means a `balanced` tier still gets a diverse, even crowd instead of everyone bunched in one corner.
        // `facing` is an offset from "square on to the DJ booth".
        // None of these fall inside the DJ platform footprint (x -3..3, z -20..-16).
        const crowdSlots = [
            { x: -3.4, z: -13.4, src: at('f1'), height: 1.70, facing:  0.10 },
            { x:  3.2, z: -13.0, src: at('m2'), height: 1.80, facing: -0.12 },
            { x:  0.4, z: -10.8, src: at('vm1'), height: 1.74, facing:  0.04 },
            { x: -6.0, z: -11.6, src: at('m1'), height: 1.86, facing:  0.28 },
            { x:  5.6, z: -11.0, src: at('f3'), height: 1.66, facing: -0.26 },
            { x: -1.4, z:  -8.6, src: at('f2'), height: 1.64, facing:  0.08 },
            { x:  2.6, z: -15.0, src: at('m3'), height: 1.78, facing: -0.06 },
            { x: -4.6, z: -15.2, src: at('f4'), height: 1.72, facing:  0.16 },
            { x:  6.6, z:  -8.4, src: at('vf1'), height: 1.77, facing: -0.34 },
            { x: -6.8, z:  -8.0, src: at('m7'), height: 1.84, facing:  0.36 },
            { x:  1.6, z:  -7.4, src: at('f5'), height: 1.68, facing: -0.10 },
            { x: -7.4, z: -13.8, src: at('vm2'), height: 1.73, facing:  0.42 },
            { x:  7.2, z: -13.6, src: at('m5'), height: 1.82, facing: -0.40 },
            { x: -0.6, z:  -6.4, src: at('m9'), height: 1.76, facing:  0.02 }
        ];
        this._crowdSlots = crowdSlots;

        // Only the files the active tier shows are fetched and parsed: a balanced headset needs six dancers, not
        // seventeen characters. `undefined` in this list means "not requested yet", `null` means "failed to load".
        this._crowdSourceContainers = new Array(VRClubAudioCrowd.AVATAR_SOURCES.length);
        this._crowdSourcePending = {};
        const required = this._requiredCrowdSources();
        log.info(`🕺 Loading ${required.length} of ${VRClubAudioCrowd.AVATAR_SOURCES.length} avatar sources for a crowd of ${crowdSize}...`);
        await this._loadCrowdSources(required);
        if (this._disposed) return;
        const containers = this._crowdSourceContainers;
        if (!this._availableCrowdSources || this._availableCrowdSources.length === 0) {
            log.warn('⚠️ No avatar sources loaded — the club will be empty');
            return;
        }

        // Do not instantiate hidden upper-tier dancers on the startup critical path. Raising the quality tier later
        // fetches the extra characters (see _applyCrowdSize) and adds them without a reload.
        this._spawnCrowdTo(crowdSize);

        // === THE DJ ===
        // Stands on the 0.5 m riser in the 1 m gap between the LED wall (z=-20) and
        // the deck plinth (z=-19), facing the floor. Playback is dialled well down so
        // they read as working the decks rather than raving in the crowd. The local generic choice owns the look.
        await this._applyDJ(this._initialDJId());

        // === THE BARTENDER ===
        // Behind the counter, washing the persistent service glass through AvatarRig so her hands can actually reach
        // the counter. She is not a guest slot (no tier removes her) and takes the bar's accent light like the stools.
        const barCrew = containers[at('bartender')];
        if (barCrew) {
            let bartender = this._spawnWorkingBartender(barCrew);
            if (!bartender) {
                const spot = window.VenueLayout.bar.bartender;
                this._spawnAvatar(barCrew, 'bartender', new BABYLON.Vector3(spot.x, 0, spot.z), -Math.PI / 2, 1.70, 0.95,
                    { clip: 'Idle_Talking_Loop', reactsToBeat: false });
                bartender = this.npcAvatars.find(npc => npc.name === 'bartender');
            }
            if (bartender) {
                bartender.slotYaw = -Math.PI / 2;
                bartender.slotClip = 'Idle_Talking_Loop';
                this._extendAccentLight(this._barLight, bartender.meshes);
                this._createBartenderGlass(bartender);
            }
        }

        this._spawnLocalPlayerBody();
        void this._restoreCustomAvatarGlb();
        this._applyCrowdSize();
        this._refreshShadowCasters();

        log.info(`✅ Crowd ready: ${this.npcAvatars.length} animated characters (incl. the DJ)`);
    }

    /**
     * Guests who are not on the dance floor: relaxed watchers, a seated regular, and a balcony guest resting both
     * hands on the rail. Clubs are not only dancers, and the side
     * walls were empty. Phone calls stay outside, away from the PA; the bouncer's folded arms suit his job rather than
     * being repeated on the side-wall guests.
     * Same hand-placed ordering rule as the crowd: the first N are already spread around the room, so a lower tier
     * still looks populated. Yaw 0 faces +z (the entrance side), PI faces
     * the DJ, +PI/2 faces +x. Every slot is well clear of the side walls, the truss legs and the DJ riser.
     */
    _guestSlots() {
        const towardDJ = (x, z) => Math.atan2(-x, -18 - z);
        const at = id => VRClubAudioCrowd.sourceIndex(id);
        // The poses a guest can change into at runtime. Only the mingling guest walks; the people he stops at turn
        // to him and talk back, so they keep their own pose plus the talking one.
        const talks = clip => (clip === 'Idle_Talking_Loop' ? undefined : [clip, 'Idle_Talking_Loop']);
        return [
            // He waits naturally until the mingler reaches him; a conversation animation without a visible partner
            // reads as talking to an invisible person.
            { src: at('m4'), clip: 'Idle_Loop', x: 7.45, z: -7.3, yaw: towardDJ(7.45, -7.3), height: 1.80,
                clips: talks('Idle_Loop'),
                ambient: { speedVariation: 0.035, period: 19, phase: 0.4 } },
            // A regular sits on the second bar stool. Authored seated clips keep her pelvis on the seat, both feet on
            // the floor and her hands at the counter; runtime occasionally has her talk with the bartender or drink.
            { src: at('f6'), clip: 'Seated_Bar_Idle_Loop', x: 9.08, z: -11.6, yaw: Math.PI / 2, height: 1.66,
                barPatron: true, clips: ['Seated_Bar_Idle_Loop', 'Seated_Bar_Drink_Loop'] },
            // The one guest who does not stay put: he walks the room and joins the others' conversations
            // (_minglerRoute, _updateMingler), which is why he carries the walk and both idles.
            { src: at('m6'), clip: 'Idle_Loop', x: -8.2, z: -10.8, yaw: Math.PI / 2 - 0.2, height: 1.84,
                mingles: true, clips: ['Walk', 'Dance_Loop', 'Idle_Loop', 'Idle_Talking_Loop', 'Drink_Loop', 'Smoke_Loop', 'Idle_Railing_Loop'] },
            // Facing the mezzanine rail, both hands planted on it while her head slowly scans the dance floor. The
            // walking guest stops beside her at the rail and, after a look at the floor, turns to talk with her.
            { src: at('f7'), clip: 'Idle_Railing_Loop', x: -10.02, y: 3.0, z: -13.9, yaw: Math.PI / 2, height: 1.66,
                clips: talks('Idle_Railing_Loop'), ambient: { speedVariation: 0.025, period: 27, phase: 1.2 } },
            { src: at('f8'), clip: 'Idle_Loop', x: -8.4, z: -6.5, yaw: Math.PI / 2 + 0.6, height: 1.68,
                clips: talks('Idle_Loop'), ambient: { yawRange: 0.16, speedVariation: 0.045, period: 21, phase: 2.8 } },
            // `Yes` is a short gesture, not an idle; looping it made him point and nod continuously.
            { src: at('m8'), clip: 'Idle_Loop', x: 7.7, z: -12.6, yaw: towardDJ(7.7, -12.6), height: 1.77,
                ambient: { yawRange: 0.1, speedVariation: 0.03, period: 25, phase: 4.1 } },
            { src: at('vm5'), clip: 'Idle_Loop', x: -8.4, z: -14.4, yaw: towardDJ(-8.4, -14.4), height: 1.77,
                clips: talks('Idle_Loop'), ambient: { yawRange: 0.14, speedVariation: 0.05, period: 18, phase: 5.3 } },
            { src: at('vf5'), clip: 'Idle_Loop', x: 9.4, z: -15.8, yaw: towardDJ(9.4, -15.8) + 0.4, height: 1.68,
                ambient: { yawRange: 0.12, speedVariation: 0.04, period: 24, phase: 0.9 } }
        ];
    }

    /**
     * Source indices the active tier shows: the player's body, the bartender, the first N dancers and the first N
     * guests. A group the visitor has sent home is not fetched at all (see isPeopleVisible); turning it back on
     * tops up the missing files in the background.
     */
    _requiredCrowdSources(crowdSize = this.isPeopleVisible('dancers') ? this.tierSettings.crowdSize : 0,
        guestSize = this.isPeopleVisible('bystanders') ? this.tierSettings.guestSize : 0) {
        const need = new Set(this.getCharacterStyle() === 'diverse' ? []
            : [VRClubAudioCrowd.sourceIndex('dancerF'), VRClubAudioCrowd.sourceIndex('dancerM')]);
        if (this.isPeopleVisible('bystanders')) need.add(VRClubAudioCrowd.sourceIndex('bartender'));
        (this._crowdSlots || []).slice(0, Math.max(0, crowdSize | 0)).forEach(slot => need.add(slot.src));
        this._guestSlots().slice(0, Math.max(0, guestSize | 0)).forEach(slot => need.add(slot.src));
        return [...need].filter(index => index >= 0);
    }

    /** Fetch one source once, however many callers ask. Resolves to its container, or null when it cannot load. */
    _loadCrowdSource(index) {
        const pending = this._crowdSourcePending || (this._crowdSourcePending = {});
        const containers = this._crowdSourceContainers;
        const style = this.getCharacterStyle();
        if (!pending[index]) {
            const source = this._characterSource(index, style);
            pending[index] = this._loadCharacterContainer(source, style).then(container => {
                if (containers) containers[index] = container;
                return container;
            });
        }
        return pending[index];
    }

    async _loadCrowdSources(indices) {
        const containers = this._crowdSourceContainers;
        for (const index of indices) {
            if (this._disposed) return;
            await this._loadCrowdSource(index);
        }
        if (containers === this._crowdSourceContainers) this._availableCrowdSources = (containers || []).filter(Boolean);
    }
    _spawnGuestsTo(target) {
        if (!this._crowdSourceContainers) return;
        const existing = new Set(this.npcAvatars.filter(npc => npc.name.startsWith('guest')).map(npc => npc.name));
        const slots = this._guestSlots();
        slots.slice(0, Math.min(Math.max(0, target | 0), slots.length)).forEach((slot, index) => {
            const name = `guest${index}`;
            const source = this._crowdSourceContainers[slot.src];
            // Only the multi-clip guest files carry these poses; without them there is nothing sensible to play.
            if (existing.has(name) || !source) return;
            this._spawnAvatar(source, name, new BABYLON.Vector3(slot.x, slot.y || 0, slot.z), slot.yaw, slot.height,
                0.9 + (index % 3) * 0.06,
                { clip: slot.clip, clips: slot.clips, reactsToBeat: false, ambient: slot.ambient });
            const npc = this.npcAvatars[this.npcAvatars.length - 1];
            if (!npc || npc.name !== name) return;
            // Where this guest stands and what it does when nobody is talking to it: the mingler returns
            // everyone it visited to exactly this.
            npc.slotYaw = slot.yaw;
            npc.slotClip = slot.clip;
            if (slot.mingles) this._startMingling(npc, slot);
            if (slot.barPatron) this._startBarPatron(npc);
        });
    }

    _spawnCrowdTo(target) {
        if (!this._crowdSlots || !this._crowdSourceContainers || !this._availableCrowdSources?.length) return;
        const existing = new Set(this.npcAvatars
            .filter(npc => npc.name.startsWith('dancer'))
            .map(npc => npc.name));
        const limit = Math.min(Math.max(0, target | 0), this._crowdSlots.length);

        this._crowdSlots.slice(0, limit).forEach((slot, index) => {
            const name = `dancer${index}`;
            if (existing.has(name)) return;
            // `undefined` = this tier's top-up is still fetching the file (it spawns afterwards); `null` = it failed,
            // so any loaded character stands in rather than leaving a hole.
            const own = this._crowdSourceContainers[slot.src];
            if (own === undefined) return;
            const source = own || this._availableCrowdSources[index % this._availableCrowdSources.length];
            if (!source) return;
            this._spawnAvatar(
                source,
                name,
                new BABYLON.Vector3(slot.x, 0, slot.z),
                Math.PI + slot.facing,
                slot.height,
                0.85 + (index % 5) * 0.07,
                // All floor dancers use the CC0 repertoire.
                { repertoire: VRClubAudioCrowd.DANCE_MOVES }
            );
        });
    }

    /**
     * Grounding: every character gets a soft dark blob on the floor beneath it. The club is lit from above by a
     * few narrow beams and nothing else casts a shadow on the floor, so without this people hover (the shadow
     * generators cover only the DJ gear). One quad with a thin instance per enabled character: one draw call,
     * no light, no per-frame work. Characters do not translate, so it is rebuilt only when the set of enabled
     * ones changes (_applyCrowdSize).
     */
    _refreshContactShadows() {
        if (!this.scene || !this.npcAvatars || typeof BABYLON.MeshBuilder === 'undefined') return;
        let shadows = this._contactShadows;
        if (!shadows) {
            const size = 128;
            const canvas = document.createElement('canvas');
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext('2d');
            const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
            // A soft Gaussian-ish falloff: dense under the feet, gone at the edge.
            for (const [stop, alpha] of [[0, 0.9], [0.2, 0.78], [0.4, 0.5], [0.6, 0.22], [0.8, 0.06], [1, 0]]) {
                gradient.addColorStop(stop, `rgba(255,255,255,${alpha})`);
            }
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, size, size);
            const texture = new BABYLON.DynamicTexture('contactShadowGradient', canvas, this.scene, false);
            texture.hasAlpha = true;
            texture.update();

            const material = new BABYLON.StandardMaterial('contactShadowMat', this.scene);
            material.diffuseColor = new BABYLON.Color3(0, 0, 0);
            material.specularColor = new BABYLON.Color3(0, 0, 0);
            material.emissiveColor = new BABYLON.Color3(0, 0, 0);
            material.opacityTexture = texture;
            material.alpha = 0.8;
            material.alphaMode = BABYLON.Engine.ALPHA_COMBINE;
            material.disableLighting = true;
            material.backFaceCulling = false;
            material.disableDepthWrite = true;
            material.depthFunction = BABYLON.Constants.LEQUAL;
            material.freeze();

            const mesh = BABYLON.MeshBuilder.CreateGround('contactShadows', { width: 1, height: 1 }, this.scene);
            mesh.material = material;
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true; // instances live far from the base mesh's bounds
            mesh.renderingGroupId = 0;
            shadows = this._contactShadows = {
                mesh,
                material,
                buffer: new Float32Array(48 * 16),
                entries: [],
                quat: new BABYLON.Quaternion(),
                scale: new BABYLON.Vector3(1, 1, 1),
                translation: new BABYLON.Vector3(),
                matrix: new BABYLON.Matrix()
            };
        }

        let count = 0;
        const { scale, translation, matrix, entries } = shadows;
        const identity = BABYLON.Quaternion.Identity();
        for (const npc of this.npcAvatars) {
            npc._shadowIndex = -1;
            if (!npc.root || !npc.root.isEnabled() || (count + 1) * 16 > shadows.buffer.length) continue;
            const diameter = npc.name === 'djPerformer' ? 1.0 : 1.15;
            const x = npc.root.position.x;
            const y = npc.root.position.y + 0.02;
            const z = npc.root.position.z;
            scale.set(diameter, 1, diameter);
            translation.set(x, y, z);
            BABYLON.Matrix.ComposeToRef(scale, identity, translation, matrix);
            matrix.copyToArray(shadows.buffer, count * 16);
            const entry = entries[count] || (entries[count] = {});
            entry.npc = npc;
            entry.x = x;
            entry.y = y;
            entry.z = z;
            entry.diameter = diameter;
            entry.street = !!npc.street;
            // A character that walks (the mingling guest) rewrites this slot's translation as it moves.
            npc._shadowIndex = count;
            count++;
        }
        entries.length = count;
        shadows.mesh.thinInstanceSetBuffer('matrix', shadows.buffer, 16, false);
        shadows.mesh.thinInstanceCount = count;
        shadows.mesh.setEnabled(count > 0);
    }

    /**
     * Dynamic projected character shadows: stretches and yaws each indoor character's shadow decal
     * away from the dominant active light source (weighted moving heads, mirror ball, or strobe burst),
     * while anchoring the foot center at `(entry.x, entry.y, entry.z)`. Zero extra draw calls or allocations.
     */
    _updateProjectedCharacterShadows() {
        const shadows = this._contactShadows;
        if (!shadows || !shadows.entries || shadows.entries.length === 0 || !shadows.mesh.isEnabled()) return;
        const master = this.masterIntensity == null ? 1 : Math.min(1, Math.max(0, this.masterIntensity));
        const spotsOn = !!(this.lightsActive && this.spotlights && this.spotlights.length > 0 && master > 0.01);
        const mirrorOn = !!(this.mirrorBallActive && master > 0.01);
        let strobeOn = false;
        if (!this.photosensitiveSafeMode && this.strobesActive && this.strobes && master > 0.01) {
            for (let s = 0; s < this.strobes.length; s++) {
                if (this.strobes[s] && this.strobes[s].flashDuration > 0) {
                    strobeOn = true;
                    break;
                }
            }
        }

        const entries = shadows.entries;
        const buf = shadows.buffer;
        const { scale, translation, quat, matrix } = shadows;
        let changed = false;

        for (let i = 0; i < entries.length; i++) {
            const e = entries[i];
            const npc = e.npc;
            if (npc && npc.root) {
                e.x = npc.root.position.x;
                e.y = npc.root.position.y + 0.02;
                e.z = npc.root.position.z;
            }
            const base = i * 16;
            // Outdoor street characters sit under overhead doorway/street light: keep isotropic grounding.
            if (e.street || (!spotsOn && !mirrorOn && !strobeOn)) {
                const d = e.diameter;
                if (!changed) {
                    changed = buf[base] !== Math.fround(d) || buf[base + 1] !== 0 || buf[base + 2] !== 0 ||
                        buf[base + 3] !== 0 || buf[base + 4] !== 0 || buf[base + 5] !== 1 ||
                        buf[base + 6] !== 0 || buf[base + 7] !== 0 || buf[base + 8] !== 0 ||
                        buf[base + 9] !== 0 || buf[base + 10] !== Math.fround(d) || buf[base + 11] !== 0 ||
                        buf[base + 12] !== Math.fround(e.x) || buf[base + 13] !== Math.fround(e.y) ||
                        buf[base + 14] !== Math.fround(e.z) || buf[base + 15] !== 1;
                }
                buf[base] = d;     buf[base + 1] = 0; buf[base + 2] = 0;  buf[base + 3] = 0;
                buf[base + 4] = 0; buf[base + 5] = 1; buf[base + 6] = 0;  buf[base + 7] = 0;
                buf[base + 8] = 0; buf[base + 9] = 0; buf[base + 10] = d; buf[base + 11] = 0;
                buf[base + 12] = e.x;
                buf[base + 13] = e.y;
                buf[base + 14] = e.z;
                buf[base + 15] = 1;
                continue;
            }

            // Accumulate horizontal shadow throw vector (away from active overhead lights)
            let sx = 0, sz = 0, totalW = 0;
            if (spotsOn) {
                const spots = this.spotlights;
                for (let k = 0; k < spots.length; k++) {
                    const spot = spots[k];
                    if (!spot || spot.beamVisible === false) continue;
                    const level = spot._rigLevel == null ? 1 : spot._rigLevel;
                    if (level <= 0.01) continue;
                    const pos = spot._photoPos || spot.basePos;
                    const hit = spot._surfaceHit && spot._surfaceHit.surfaceIntersection;
                    if (!pos) continue;
                    // Weight by proximity of the beam's floor pool to the character, plus direct overhead proximity
                    let w = level * master;
                    if (hit) {
                        const pdx = e.x - hit.x, pdz = e.z - hit.z;
                        w *= 1.8 / (1 + (pdx * pdx + pdz * pdz) * 0.14);
                    } else {
                        const ldx = e.x - pos.x, ldz = e.z - pos.z;
                        w *= 1.0 / (1 + (ldx * ldx + ldz * ldz) * 0.04);
                    }
                    const dx = e.x - pos.x;
                    const dz = e.z - pos.z;
                    const dy = Math.max(2.2, pos.y - e.y);
                    sx += (dx / dy) * w;
                    sz += (dz / dy) * w;
                    totalW += w;
                }
            }
            if (mirrorOn) {
                const mdx = e.x - 0;
                const mdz = e.z - (-12);
                const mdy = Math.max(2.5, 6.5 - e.y);
                const mw = 0.55 * master / (1 + (mdx * mdx + mdz * mdz) * 0.03);
                sx += (mdx / mdy) * mw;
                sz += (mdz / mdy) * mw;
                totalW += mw;
            }
            if (strobeOn && this.strobes) {
                for (let s = 0; s < this.strobes.length; s++) {
                    const st = this.strobes[s];
                    if (!st || !(st.flashDuration > 0) || !st.mesh) continue;
                    const sp = st.mesh.position;
                    const sdx = e.x - sp.x, sdz = e.z - sp.z;
                    const sdy = Math.max(2.5, (sp.y || 7.6) - e.y);
                    const sw = 1.6 * master / (1 + (sdx * sdx + sdz * sdz) * 0.025);
                    sx += (sdx / sdy) * sw;
                    sz += (sdz / sdy) * sw;
                    totalW += sw;
                }
            }

            if (totalW > 1e-4) {
                sx /= totalW;
                sz /= totalW;
            }
            const throwMag = Math.min(0.85, Math.hypot(sx, sz));
            const stretch = 1 + throwMag * 0.68; // elongates up to ~1.58x away from the key light
            const width = e.diameter * (1 - throwMag * 0.08);
            const length = e.diameter * stretch;
            const yaw = throwMag > 0.02 ? Math.atan2(sx, sz) : 0;

            scale.set(width, 1, length);
            BABYLON.Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, quat);
            // Keep translation at (e.x, e.y, e.z) so the contact center under the feet never drifts off the character.
            translation.set(e.x, e.y, e.z);
            BABYLON.Matrix.ComposeToRef(scale, quat, translation, matrix);
            if (!changed) {
                for (let j = 0; j < 16; j++) {
                    if (buf[base + j] !== Math.fround(matrix.m[j])) {
                        changed = true;
                        break;
                    }
                }
            }
            matrix.copyToArray(buf, base);
        }
        if (changed) shadows.mesh.thinInstanceBufferUpdated('matrix');
    }

    /** A higher tier needs characters nobody fetched yet: load them in the background, then place them. */
    _topUpCrowdSources() {
        if (!this._crowdSourceContainers || !this._crowdSlots || this._crowdTopUp || this._disposed) return;
        const missing = this._requiredCrowdSources().filter(index => this._crowdSourceContainers[index] === undefined);
        if (missing.length === 0) return;
        this._crowdTopUp = this._loadCrowdSources(missing).catch(() => {}).then(() => {
            this._crowdTopUp = null;
            if (!this._disposed) this._applyCrowdSize();
        });
    }

    _applyCrowdSize() {
        if (!this.npcAvatars) return;
        // A hidden group is simply a target of zero, so the tier's own sizes are untouched and turning the group
        // back on restores exactly the crowd this tier would have had.
        const dancersOn = this.isPeopleVisible('dancers');
        const bystandersOn = this.isPeopleVisible('bystanders');
        const target = dancersOn ? Math.max(0, this.tierSettings.crowdSize | 0) : 0;
        const guestTarget = bystandersOn ? Math.max(0, this.tierSettings.guestSize | 0) : 0;
        this._topUpCrowdSources();
        this._spawnCrowdTo(target);
        this._spawnGuestsTo(guestTarget);
        this.npcAvatars.forEach(npc => {
            const isGuest = npc.name.startsWith('guest');
            const isDancer = npc.name.startsWith('dancer');
            let enabled;
            if (isGuest || isDancer) {
                const index = Number(npc.name.slice(isGuest ? 'guest'.length : 'dancer'.length));
                enabled = Number.isFinite(index) && index < (isGuest ? guestTarget : target);
            } else if (npc.name === 'bartender') {
                // She is not a guest slot (no tier removes her), but she is a bystander.
                enabled = bystandersOn;
            } else {
                return;
            }
            npc.root.setEnabled(enabled);
            // The occupant box is its own mesh: left enabled, a hidden dancer stays solid.
            if (npc.collider) npc.collider.setEnabled(enabled);
            VRClubAudioCrowd._setAnimating(npc, enabled);
        });
        if (typeof this._applyStreetPeople === 'function') this._applyStreetPeople();
        this._refreshContactShadows();
    }

    // ───────────────────────── who is in the club ─────────────────────────
    //
    // Three groups of characters, each of which a visitor can send home: the dancers on the dance floor, the
    // bystanders (the side guests, the mingler, the bartender, and the bouncer and the queue on the pavement) and
    // the DJ. The preference lives on the instance (VRClubCore.resolvePeopleVisibility), _applyCrowdSize and
    // _showStreetPeople are the only places that act on it, and both run again after a tier change or a DJ swap.

    /** Is this group of characters in the club? An unknown name is never hidden. */
    isPeopleVisible(category) {
        const visibility = this.peopleVisibility;
        const personal = !visibility || !Object.prototype.hasOwnProperty.call(visibility, category) || visibility[category] !== false;
        return personal && (category !== 'dj' || this._roomDJVisible !== false);
    }

    setRoomDJVisible(visible) {
        const next = typeof visible === 'boolean' ? visible : null;
        if ((this._roomDJVisible ?? null) === next) return;
        this._roomDJVisible = next;
        this._applyDJVisibility();
        this._refreshVRQuickMenu();
    }

    /**
     * Keep personal hide preferences. In a room the host's DJ preference also sets the room's presence;
     * a guest may hide that DJ, but cannot bring back one the host sent home.
     * @param {string|null} category 'dancers', 'bystanders', 'dj', or 'all' for every group at once
     * @returns {boolean} whether the group is now visible
     */
    setPeopleVisible(category, visible) {
        const on = !!visible;
        const visibility = this.peopleVisibility || (this.peopleVisibility = VRClubCore.resolvePeopleVisibility());
        let changed = false;
        for (const name of VRClubCore.peopleCategories(category)) {
            if (visibility[name] === on) continue;
            visibility[name] = on;
            changed = true;
        }
        if (changed) {
            this._persistPeopleVisibility();
            this.applyPeopleVisibility();
        }
        return category === 'dj' ? this.isPeopleVisible('dj') : on;
    }

    /** Flip a group. 'all' comes back only when every group is away, so one press empties the club. */
    togglePeopleVisible(category) {
        const names = VRClubCore.peopleCategories(category);
        if (names.length === 0) return true;
        return this.setPeopleVisible(category, !names.some(name => this.peopleVisibility?.[name] !== false));
    }

    _persistPeopleVisibility() {
        const hidden = VRClubCore.PEOPLE_CATEGORIES.filter(name => this.peopleVisibility?.[name] === false);
        try {
            if (hidden.length > 0) localStorage.setItem('vrclub.hiddenPeople', hidden.join(','));
            else localStorage.removeItem('vrclub.hiddenPeople');
        } catch (_) { /* private browsing */ }
    }

    /** Put all three groups where the preference says, now. */
    applyPeopleVisibility() {
        this._applyCrowdSize();          // the dancers, the side guests, the bartender, then the street people
        this._applyDJVisibility();
    }

    /** The DJ is not a crowd slot: an AvatarRig posed by DJPerformer, replaced on local selection. */
    _applyDJVisibility() {
        const enabled = this.isPeopleVisible('dj') && !this.performingAsDJ;
        if (typeof this._applyVJDeskPlayerVisibility === 'function') this._applyVJDeskPlayerVisibility();
        if (enabled && !this.isFollowingHost?.() && typeof this.resetDJEffects === 'function') this.resetDJEffects();
        if (enabled && this._djWanted && this._djWanted !== this._djId) {
            this.setDJ(this._djWanted).then(applied => {
                if (!applied) this.showErrorMessage('The selected DJ could not load. Try again later.');
            }).catch(error => this.showErrorMessage(`The selected DJ could not load: ${error.message}`));
        }
        const npc = this.npcAvatars && this.npcAvatars.find(item => item.name === 'djPerformer');
        if (!npc || !npc.root) {
            return;
        }
        if (npc.root.isEnabled() === enabled) return;
        npc.root.setEnabled(enabled);
        if (npc.collider) npc.collider.setEnabled(enabled);
        VRClubAudioCrowd._setAnimating(npc, enabled);
        this._refreshContactShadows();
    }

    // ───────────────────────── the street door: a bouncer and a queue ─────────────────────────
    //
    // Outside the street door, on the pavement at street level, a bouncer in a black suit stands beside the door and a
    // line of people waits along the club's front behind a velvet rope (CityDistrict._createStreetDoorDressing). They
    // exist only once the street has loaded (there is no pavement for them otherwise), their files load in the
    // background, they are drawn only while the street is (updateCityDistrict -> _showStreetPeople), and they take the
    // door lamp as their first light. The queue is as long as the tier allows (`queueSize`).

    /**
     * The bouncer and the queue, in world coordinates (`y` is the pavement). Yaw 0 faces +z (the road), +PI/2 faces +x;
     * the door is to the -x side of everyone in the queue. Ordered so a short queue is already varied (a talking pair, a
     * man and a woman on their own) and, on the lower tiers, holds nobody who is also dancing inside.
     */
    _streetSlots() {
        const ground = (typeof window !== 'undefined' && window.CityLayout && window.CityLayout.groundY) || 0;
        const at = id => VRClubAudioCrowd.sourceIndex(id);
        const door = -Math.PI / 2;
        const face = (x, z, tx, tz) => Math.atan2(tx - x, tz - z);
        const queue = [
            { src: at('vm6'), clip: 'Idle_Talking_Loop', x: 3.15, z: 7.1, yaw: face(3.15, 7.1, 3.9, 6.9), height: 1.78,
                ambient: { speedVariation: 0.04, period: 19, phase: 0.3 } },
            { src: at('vf6'), clip: 'Idle_Talking_Loop', x: 3.9, z: 6.9, yaw: face(3.9, 6.9, 3.15, 7.1), height: 1.67,
                ambient: { speedVariation: 0.035, period: 23, phase: 2.2 } },
            { src: at('vm7'), clip: 'Idle', x: 4.85, z: 7.0, yaw: door + 0.12, height: 1.82,
                ambient: { yawRange: 0.18, speedVariation: 0.045, period: 21, phase: 1.1 } },
            { src: at('vf2'), clip: 'Idle', x: 5.7, z: 6.95, yaw: door - 0.18, height: 1.66,
                ambient: { yawRange: 0.13, speedVariation: 0.05, period: 26, phase: 3.7 } },
            { src: at('vm3'), clip: 'Idle', x: 6.6, z: 7.05, yaw: door + 0.25, height: 1.76,
                ambient: { yawRange: 0.2, speedVariation: 0.04, period: 18, phase: 5.1 } },
            { src: at('vf7'), clip: 'Idle_TalkingPhone_Loop', x: 7.45, z: 6.9, yaw: door + 0.7, height: 1.70,
                ambient: { yawRange: 0.07, speedVariation: 0.035, period: 24, phase: 4.2 } },
            { src: at('vm4'), clip: 'Idle', x: 8.35, z: 7.05, yaw: door - 0.1, height: 1.80,
                ambient: { yawRange: 0.15, speedVariation: 0.045, period: 22, phase: 2.6 } },
            { src: at('vf3'), clip: 'Idle', x: 9.15, z: 6.95, yaw: door + 0.3, height: 1.69,
                ambient: { yawRange: 0.17, speedVariation: 0.04, period: 27, phase: 0.8 } }
        ].map(slot => ({ ...slot, y: ground }));
        return {
            // Beside the door, outside its opening, watching the street and the head of the queue.
            bouncer: { src: at('bouncer'), clip: 'Idle_Loop', x: 2.25, y: ground, z: 6.85, yaw: 0.35, height: 1.96 },
            queue
        };
    }

    /** The street people the active tier shows, spawned once their files have loaded; then shown with the street. */
    _applyStreetPeople() {
        if (!this._cityRoot || !this._crowdSourceContainers || !this.npcAvatars || this._disposed) return;
        // Sent home: hide whoever is already out there and fetch nobody new.
        if (!this.isPeopleVisible('bystanders')) { this._showStreetPeople(false); return; }
        const { bouncer, queue } = this._streetSlots();
        const target = Math.min(queue.length, Math.max(0, (this.tierSettings && this.tierSettings.queueSize) | 0));
        const wanted = [bouncer, ...queue.slice(0, target)];
        const missing = [...new Set(wanted.map(slot => slot.src))]
            .filter(index => index >= 0 && this._crowdSourceContainers[index] === undefined);
        if (missing.length > 0) {
            // In the background, off everything else's path: then come back and place them.
            if (!this._streetTopUp) {
                this._streetTopUp = this._loadCrowdSources(missing).catch(() => {}).then(() => {
                    this._streetTopUp = null;
                    if (!this._disposed) this._applyStreetPeople();
                });
            }
            return;
        }
        const placed = [];
        const spawn = (slot, name, index) => {
            if (this.npcAvatars.some(npc => npc.name === name)) return;
            const source = this._crowdSourceContainers[slot.src];
            if (!source) return;   // the file failed to load: nobody stands in that spot
            const entry = this._spawnAvatar(source, name, new BABYLON.Vector3(slot.x, slot.y, slot.z), slot.yaw, slot.height,
                0.85 + (index % 4) * 0.06,
                { clip: slot.clip, reactsToBeat: false, ambient: slot.ambient });
            const npc = entry && this.npcAvatars[this.npcAvatars.length - 1];
            if (npc && npc.name === name) {
                npc.homeYaw = null;
                npc.streetYaw = slot.yaw;
                npc.street = true;
                if (name === 'bouncer') npc.ambient = null;
                placed.push(npc);
            }
        };
        spawn(bouncer, 'bouncer', 0);
        queue.slice(0, target).forEach((slot, index) => spawn(slot, `queue${index}`, index + 1));
        const lights = [this._streetDoorLight, this._cityFillLight].filter(Boolean);
        for (const npc of placed) for (const light of lights) this._extendAccentLight(light, npc.meshes);
        this._bouncer = this.npcAvatars.find(npc => npc.name === 'bouncer') || null;
        this._showStreetPeople(this._cityVisible !== false, placed.length > 0);
    }

    /**
     * Show (and animate) the street people while the street is drawn, up to the tier's queue length; hide them otherwise.
     * `placed`: someone new arrived, so the contact shadows are rebuilt even if nobody's visibility changed.
     */
    _showStreetPeople(visible, placed = false) {
        if (!this.npcAvatars) return;
        const target = Math.max(0, (this.tierSettings && this.tierSettings.queueSize) | 0);
        const here = !!visible && this.isPeopleVisible('bystanders');
        let changed = placed;
        for (const npc of this.npcAvatars) {
            const isQueue = /^queue\d+$/.test(npc.name);
            if (!isQueue && npc.name !== 'bouncer') continue;
            const enabled = here && (!isQueue || Number(npc.name.slice(5)) < target);
            if (npc.root.isEnabled() !== enabled) changed = true;
            npc.root.setEnabled(enabled);
            if (npc.collider) npc.collider.setEnabled(enabled);
            // Re-shown with the street: playing again until the per-frame check (see _updateStreetPeopleActivity) says otherwise.
            if (!enabled) npc.animPaused = false;
            VRClubAudioCrowd._setAnimating(npc, enabled && !npc.animPaused);
        }
        if (changed) this._refreshContactShadows();
    }

    /** Play or pause a character's clips when its tier or district visibility changes. */
    static _setAnimating(npc, on) {
        for (const group of npc.animations || []) {
            if (on) {
                if (!group.isPlaying && group.restart) group.restart();
            } else if (group.isPlaying && group.pause) {
                group.pause();
            }
        }
    }

    /**
     * Switch a character kept with several poses (_spawnAvatar's `clips`) to one of them. Only one group ever
     * plays — it blends out of whatever the last one left — and `animations` follows, so _setAnimating still
     * pauses and restarts the right clip when a tier hides the character.
     */
    static _playClip(npc, clip, speedRatio, loop = true) {
        const poses = npc && npc.poses;
        const next = poses && poses.groups.get(clip);
        if (!next) return false;
        if (next !== poses.current || !next.isPlaying) {
            next.start(loop, speedRatio, next.from, next.to);
            if (poses.current && poses.current !== next) poses.current.stop();
            poses.current = next;
            npc.animations = [next];
        }
        next.speedRatio = speedRatio;
        return true;
    }

    /** Turn a character toward a world yaw at a rate, frame-rate independently. True once it has arrived. */
    static _easeYaw(node, goal, dt, rate) {
        let diff = goal - node.rotation.y;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        node.rotation.y += diff * (1 - Math.exp(-Math.max(0, dt) * rate));
        return Math.abs(diff) < 0.01;
    }

    /**
     * Should a street character keep animating? Only a character clearly BEHIND the viewer is held: more than 130 degrees
     * off the gaze and farther than 4 m. It resumes at 115 degrees, long before a headset's ~55 degree half field of view
     * (a quick 300 degree/s turn takes about 0.2 s to cover the gap), and from the exact frame it stopped, so nothing is
     * ever seen frozen or seen to start moving. Pure; `wasPaused` gives it hysteresis.
     */
    static needsAnimation(wasPaused, cx, cy, cz, fx, fy, fz, px, py, pz) {
        const dx = px - cx, dy = py - cy, dz = pz - cz;
        const distance = Math.hypot(dx, dy, dz);
        if (distance < (wasPaused ? 3.5 : 4)) return true;
        const cos = (dx * fx + dy * fy + dz * fz) / distance;
        return wasPaused ? cos > -0.4226 : cos > -0.6428;
    }

    /** Hold the street people who are behind the viewer; see needsAnimation. */
    _updateStreetPeopleActivity() {
        const cam = this._playerCamera();
        const eye = cam && (cam.globalPosition || cam.position);
        if (!eye || !this.npcAvatars) return;
        const dir = this._streetGaze || (this._streetGaze = new BABYLON.Vector3());
        cam.getDirectionToRef(BABYLON.Axis.Z, dir);
        for (const npc of this.npcAvatars) {
            if (!npc.street || !npc.root || !npc.root.isEnabled()) continue;
            const p = npc.root.position;
            const needs = VRClubAudioCrowd.needsAnimation(!!npc.animPaused, eye.x, eye.y, eye.z, dir.x, dir.y, dir.z, p.x, p.y + 0.9, p.z);
            if (needs === !npc.animPaused) continue;
            npc.animPaused = !needs;
            VRClubAudioCrowd._setAnimating(npc, needs);
        }
    }

    /** The bouncer scans the pavement until somebody comes close, then turns toward them (never more than ~75 degrees). */
    _updateBouncer(dt) {
        const npc = this._bouncer;
        if (!npc || !npc.root || !npc.root.isEnabled()) return;
        const step = Math.max(0, dt || 0);
        npc.watchTime = (npc.watchTime || 0) + step;
        const cam = this._playerCamera();
        const pos = cam && (cam.globalPosition || cam.position);
        const home = npc.streetYaw || 0;
        let goal = home + 0.12 * (
            0.7 * Math.sin(npc.watchTime * 0.23 + 0.8)
            + 0.3 * Math.sin(npc.watchTime * 0.09 + 2.1)
        );
        if (pos) {
            const dx = pos.x - npc.root.position.x, dz = pos.z - npc.root.position.z;
            const d2 = dx * dx + dz * dz;
            if (d2 < 49 && d2 > 0.04 && Math.abs(pos.y - npc.root.position.y) < 3) {
                let off = Math.atan2(dx, dz) - home;
                off = Math.atan2(Math.sin(off), Math.cos(off));
                goal = home + Math.max(-1.3, Math.min(1.3, off));
            }
        }
        const k = 1 - Math.exp(-step * 2.5);
        npc.root.rotation.y += (goal - npc.root.rotation.y) * k;
    }

    /**
     * Fixed bystanders already have authored breathing and hand motion. This adds slow attention changes without
     * disturbing a planted rail grip or fighting a conversation that the mingler currently owns.
     */
    _updateAmbientNPC(npc, time, dt) {
        const ambient = npc && npc.ambient;
        if (!ambient || !npc.root || !npc.root.isEnabled() || npc.dance || npc.mingle || npc.rig) return;
        const mingle = this._mingler && this._mingler.mingle;
        if (mingle && (mingle.partner === npc || mingle.returning === npc)) return;
        const period = ambient.period || 18;
        const phase = ambient.phase || 0;
        const wave = (
            Math.sin(time * (Math.PI * 2 / period) + phase)
            + 0.35 * Math.sin(time * (Math.PI * 2 / (period * 2.3)) + phase * 1.7)
        ) / 1.35;
        if (ambient.yawRange > 0) {
            const goal = ambient.baseYaw + ambient.yawRange * wave;
            VRClubAudioCrowd._easeYaw(npc.root, goal, dt, 1.4);
        }
        if (ambient.speedVariation > 0) {
            const speed = npc.baseSpeed * (1 + ambient.speedVariation * wave);
            for (let i = 0; i < npc.animations.length; i++) npc.animations[i].speedRatio = speed;
        }
    }
    
    // ───────────────────────── the crowd dances on the beat ─────────────────────────
    //
    // The Quaternius dancers each keep several moves (Dance_Loop and the grooves built by scripts/build-crowd-glbs.mjs)
    // and CrowdDance (js/crowdDance.js) decides who does what, on the club's beat grid. Here: the music it needs, once a
    // frame, and its decisions applied to the animation groups (one plays at a time; a new move blends in).

    /** The clips a Quaternius dancer keeps (the rest of its file is disposed at spawn). */
    static get DANCE_MOVES() {
        return typeof CrowdDance !== 'undefined' ? Object.keys(CrowdDance.MOVES) : ['Dance_Loop'];
    }

    /** An animation clock, not an inferred musical beat. Only confirmed embedded playback enables it. */
    _unanalysedDanceMusic() {
        if (this._audioKind !== 'soundcloud' || !this._soundCloudFrame || !this._soundCloudPlaying) return null;
        const music = this._unanalysedDanceState || (this._unanalysedDanceState = {
            fallback: true, beatPresent: false, rhythm: false, beat: 0, bpm: 120,
            energy: 0.55, build: false, drop: false
        });
        music.beat = (this._soundCloudDanceBeat || 0) +
            Math.max(0, performance.now() - this._soundCloudDanceStartedAt) / 500;
        return music;
    }

    /** The music as the choreographer sees it, in one reused object. */
    _crowdMusic(audioData) {
        const m = this._crowdMusicState || (this._crowdMusicState = { beatPresent: false, rhythm: false, beat: 0, bpm: 120, energy: 0.5, build: false, drop: false });
        m.time = performance.now() / 1000;
        if (this._audioKind === 'soundcloud') {
            this._crowdAudioUntil = 0;
            m.beatPresent = false;
            m.rhythm = false;
            m.build = false;
            m.drop = false;
            const fallback = this._unanalysedDanceMusic();
            if (fallback) {
                fallback.energy = 0.55 * (Number.isFinite(this._localPaPresence) ? this._localPaPresence : 1);
                return fallback;
            }
            return m;
        }
        const vj = this.vjDirector, show = this.showDirector;
        m.bpm = (vj && vj.bpm) || 120;
        const now = performance.now();
        const beatMs = 60000 / m.bpm;
        const hasAudioNow = !!(audioData && audioData.hasAudio);
        // A single quiet analyser frame must not make the whole floor drop into its free sway. Hold audible state
        // for two beats; genuine silence still wins quickly, while a render hitch or a sparse frame does not.
        if (hasAudioNow) this._crowdAudioUntil = now + Math.max(1000, 2 * beatMs);
        const hasAudio = hasAudioNow || now < (this._crowdAudioUntil || 0);
        if (vj) {
            // The continuous beat position: the counter plus how far into this beat the bar phase is.
            const inBar = vj.beatNumber % 4;
            const barPhase = Number.isFinite(this.barPhase) ? this.barPhase : 0;
            m.beat = vj.beatNumber + Math.max(0, Math.min(1, barPhase * 4 - inBar));
        }
        // The kick is here until the show would call the gap a breakdown. It is back after two kicks in a row (one
        // stray hit is not a beat). The old 2.5-beat window made frame stalls and an occasional missed onset send
        // everybody to the idle-looking sway while the track and the VJ flywheel were plainly still on the beat.
        const recent = !!vj && vj.realOnsetCount > 0 &&
            now - vj.lastRealOnsetAt < Math.max(1600, 7 * beatMs);
        m.beatPresent = hasAudio && recent && (m.beatPresent || (vj.onsetStreak || 0) >= 2);
        // No kick, but hats, a snare or a synth still keep time: the crowd keeps dancing on the grid (CrowdDance).
        m.rhythm = !m.beatPresent && hasAudio && !!vj && vj.rhythmPresent === true;
        const localPresence = Number.isFinite(this._localPaPresence) ? this._localPaPresence : 1;
        m.energy = (audioData && typeof audioData.energy === 'number' ? audioData.energy
            : (show && Number.isFinite(show._energy) ? Math.min(1, show._energy / 0.45) : 0.5)) * localPresence;
        // A build (the countdown, or the ascent movement) and the frame a drop lands (the release, or ignition starting).
        m.build = false;
        m.drop = false;
        if (show) {
            const piece = show._setPiece || null;
            m.build = (!!show.setPieces && piece === show.setPieces.countdown) || show._movementName === 'ascent';
            if (piece !== this._crowdLastPiece) {
                if (piece && show.setPieces && piece === show.setPieces.release) m.drop = true;
                this._crowdLastPiece = piece;
            }
            if (show._movementName !== this._crowdLastMovement) {
                if (show._movementName === 'ignition' && this._crowdLastMovement != null) m.drop = true;
                this._crowdLastMovement = show._movementName;
            }
        }
        return m;
    }

    /** Where a playing group is in its loop (0..1), or null. */
    static _loopFraction(group) {
        const animatable = group && group.isPlaying && group.animatables && group.animatables[0];
        const span = group ? group.to - group.from : 0;
        if (!animatable || !(span > 0)) return null;
        const f = (animatable.masterFrame - group.from) / span;
        return f - Math.floor(f);
    }

    /** Per frame: every Quaternius dancer on the floor does its move, on the beat. */
    _updateCrowdDance(dt, audioData) {
        if (!this.npcAvatars || typeof CrowdDance === 'undefined') return;
        const choreographer = this._crowdDance || (this._crowdDance = new CrowdDance());
        const music = this._crowdMusic(audioData);
        this._crowdBeatPresent = music.beatPresent;
        const decision = this._crowdDecision || (this._crowdDecision = {});
        // Starting a clip builds an animatable for every bone, so only a couple of dancers may change move in one frame; the
        // rest wait a frame or two (their choreographer state already holds the new move, and the next frame's phase check
        // finds the old clip out of step and makes the change). Without it a drop or a bar line started a dozen at once.
        let starts = VRClubAudioCrowd.CROWD_STARTS_PER_FRAME;
        for (const npc of this.npcAvatars) {
            const dance = npc.dance;
            if (!dance || !npc.root.isEnabled()) continue;
            if (!dance.state) dance.state = choreographer.createDancer([...dance.groups.keys()]);
            choreographer.step(dance.state, music, VRClubAudioCrowd._loopFraction(dance.current), decision);
            let group = dance.current;
            const next = dance.groups.get(decision.move);
            // A dancer whose clip is not the move the choreographer holds is waiting for its turn to start it.
            const changing = !!next && next !== group;
            if (changing && starts <= 0) continue;
            if (decision.switched || decision.snap || changing) {
                let frac = decision.frac;
                if (changing) {
                    starts--;
                    if (!decision.switched && !decision.snap) frac = Number.isFinite(decision.target) ? decision.target : Math.random();
                    // Start the new move first: it blends from the pose the old one leaves (enableBlending), then the
                    // old one stops where it is.
                    next.start(true, decision.speed, next.from, next.to);
                    group.stop();
                    dance.current = group = next;
                    npc.animations = [next];
                }
                group.goToFrame(group.from + frac * (group.to - group.from));
            }
            group.speedRatio = decision.speed;
        }
    }

    /** How many dancers may start a new clip in one frame (see _updateCrowdDance). */
    static get CROWD_STARTS_PER_FRAME() { return 2; }

    static _attentionRandom(dance) {
        dance.attentionSeed = (Math.imul(dance.attentionSeed, 1664525) + 1013904223) >>> 0;
        return dance.attentionSeed / 4294967296;
    }

    /** Reconsider one dancer's gaze at 7.5 Hz; authored clips continue to own every joint. */
    _sampleCrowdAttention(npc, time, camPos) {
        const dance = npc.dance;
        dance.nextAttention = time + 0.14;
        if (time >= dance.attentionUntil) {
            const active = VRClubAudioCrowd._attentionRandom(dance) < 0.58;
            dance.attending = active;
            dance.attentionUntil = time + (active
                ? 1.2 + VRClubAudioCrowd._attentionRandom(dance) * 2.0
                : 0.8 + VRClubAudioCrowd._attentionRandom(dance) * 1.4);
        }
        if (!dance.attending) {
            dance.attentionTargetYaw = 0;
            return;
        }

        const here = npc.root.position;
        let bestX = 0, bestZ = 0, best = 36;
        if (camPos) {
            const dx = camPos.x - here.x, dz = camPos.z - here.z;
            const d2 = dx * dx + dz * dz, score = d2 * 0.55;
            if (d2 >= 0.36 && d2 <= 36 && score < best) {
                best = score; bestX = camPos.x; bestZ = camPos.z;
            }
        }
        const dj = this._djPerformer;
        if (dj && dj.home) {
            const dx = dj.home.x - here.x, dz = dj.home.z - here.z;
            const d2 = dx * dx + dz * dz, score = d2 * 0.72;
            if (d2 >= 0.36 && d2 <= 36 && score < best) {
                best = score; bestX = dj.home.x; bestZ = dj.home.z;
            }
        }
        for (let i = 0; i < this.npcAvatars.length; i++) {
            const other = this.npcAvatars[i];
            if (other === npc || !other.root || !other.root.isEnabled()) continue;
            const x = other.root.position.x, z = other.root.position.z;
            const dx = x - here.x, dz = z - here.z;
            const d2 = dx * dx + dz * dz;
            if (d2 >= 0.36 && d2 <= 36 && d2 < best) {
                best = d2; bestX = x; bestZ = z;
            }
        }
        if (best >= 36) {
            dance.attentionTargetYaw = 0;
            return;
        }
        const toward = Math.atan2(bestX - here.x, bestZ - here.z);
        const delta = Math.atan2(Math.sin(toward - npc.homeYaw), Math.cos(toward - npc.homeYaw));
        // At a 15 cm foot radius this moves a planted foot by at most 1.5 cm.
        dance.attentionTargetYaw = Math.max(-0.1, Math.min(0.1, delta));
    }

    /**
     * @param {number} time
     * @param {object} [audioData] Analyser output for THIS frame, supplied by
     *   updateAnimations.
     */
    updateDancingNPCs(time, audioData, dt = 1 / 60) {
        // GLB avatars animate themselves via their animation groups; this only
        // nudges playback rate so the floor visibly reacts to the low end.
        if (!this.npcAvatars || this.npcAvatars.length === 0) return;

        if (!audioData) audioData = this.getAudioData();
        // The three Mixamo dancers have one authored clip each. Keep its intended pace when the kick drops out;
        // slowing it to 45% reads as broken slow motion rather than the deliberate free grooves used by CrowdDance.
        const localBass = audioData.bass * (Number.isFinite(this._localPaPresence) ? this._localPaPresence : 1);
        const beatBoost = (audioData.hasAudio && localBass > 0.3)
            ? 1.0 + (localBass - 0.3) * 0.3
            : 1.0;

        const tempoChanged = Math.abs(beatBoost - this._npcBeatBoost) >= 0.01;
        if (tempoChanged) {
            this._npcBeatBoost = beatBoost;
        }

        // TransformNode/skinned-hierarchy frustum bounds are unreliable as animation advances, especially in stereo
        // XR. Every enabled character therefore keeps animating; tier and district visibility own explicit pausing.
        const cam = this.scene ? this.scene.activeCamera : null;
        const checkProximity = cam && (this.frameCounter % 4 === 0);
        const camPos = cam ? (cam.globalPosition || cam.position) : null;

        for (let i = 0; i < this.npcAvatars.length; i++) {
            const npc = this.npcAvatars[i];
            if (!npc.animations || !npc.root || !npc.root.isEnabled()) continue;
            this._updateAmbientNPC(npc, time, dt);
            if (npc.dance) {
                if (time >= npc.dance.nextAttention) this._sampleCrowdAttention(npc, time, camPos);
                const k = 1 - Math.exp(-4 * Math.max(0, Math.min(0.1, dt)));
                npc.dance.attentionYaw += (npc.dance.attentionTargetYaw - npc.dance.attentionYaw) * k;
            }

            // A dancer with a repertoire takes its tempo from the choreographer, on the beat.
            if (tempoChanged && npc.reactsToBeat !== false && !npc.dance) {
                for (let a = 0; a < npc.animations.length; a++) {
                    npc.animations[a].speedRatio = npc.baseSpeed * beatBoost;
                }
            }

            if (checkProximity && camPos) {
                const rootPos = npc.root.position;
                const dx = rootPos.x - camPos.x;
                const dz = rootPos.z - camPos.z;
                const distSq = dx * dx + dz * dz;

                if (npc.homeYaw != null) {
                    if (distSq < 2.56) {
                        const step = dx >= 0 ? 0.08 : -0.08;
                        npc.avoidYaw = Math.max(-0.5, Math.min(0.5, (npc.avoidYaw || 0) + step));
                    } else if (npc.avoidYaw) {
                        npc.avoidYaw *= 0.75;
                        if (Math.abs(npc.avoidYaw) < 0.01) npc.avoidYaw = 0;
                    }
                }
            }
            if (npc.homeYaw != null) {
                npc.root.rotation.y = npc.homeYaw + (npc.avoidYaw || 0)
                    + (npc.dance ? npc.dance.attentionYaw : 0);
            }
        }
    }
}
window.VRClubCrowd = VRClubCrowd;
