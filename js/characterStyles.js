'use strict';

window.CharacterStyles = {
    _initCharacterStyles() {
        if (this._characterStyles) return this._characterStyles;
        let preference = 'quaternius', lightweight = false;
        try {
            if (localStorage.getItem('vrclub.characterStyle') === 'diverse') preference = 'diverse';
            lightweight = localStorage.getItem('vrclub.lightweightCharacters') === '1';
        } catch (error) {
            log.warn('Character preferences could not be read:', error);
        }
        return (this._characterStyles = {
            preference, lightweight, room: null, applied: lightweight ? 'quaternius' : preference,
            generation: 0, loading: null, error: null, sources: new Map()
        });
    },

    getCharacterStyle() {
        return this._initCharacterStyles().applied;
    },

    getRoomCharacterStyle() {
        const state = this._initCharacterStyles();
        return state.room || state.preference;
    },

    _wantedCharacterStyle() {
        return this._initCharacterStyles().lightweight ? 'quaternius' : this.getRoomCharacterStyle();
    },

    characterStyleStatus() {
        const state = this._initCharacterStyles();
        return { style: state.applied, selected: this.getRoomCharacterStyle(), lightweight: state.lightweight,
            loading: state.loading, error: state.error };
    },

    setCharacterStyle(style) {
        if (!['quaternius', 'diverse'].includes(style)) throw new RangeError('Unknown character style.');
        if (this.isFollowingHost()) {
            this.showErrorMessage('The host chooses the room character style. Lightweight characters is your own choice.');
            return Promise.resolve(false);
        }
        const state = this._initCharacterStyles();
        try { localStorage.setItem('vrclub.characterStyle', style); }
        catch (error) {
            log.warn('Character style could not be saved:', error);
            this.showErrorMessage('Character style could not be saved on this device.');
            return Promise.resolve(false);
        }
        state.preference = style;
        if (this.multiplayer && this.multiplayer.connected) state.room = style;
        if (this.multiplayer && this.multiplayer._show) this.multiplayer._show.dirty = true;
        return this._queueCharacterStyle();
    },

    setLightweightCharacters(enabled) {
        if (typeof enabled !== 'boolean') throw new TypeError('Lightweight characters must be on or off.');
        const state = this._initCharacterStyles();
        try { localStorage.setItem('vrclub.lightweightCharacters', enabled ? '1' : '0'); }
        catch (error) {
            log.warn('Lightweight character preference could not be saved:', error);
            this.showErrorMessage('Lightweight characters could not be saved on this device.');
            return Promise.resolve(false);
        }
        state.lightweight = enabled;
        return this._queueCharacterStyle();
    },

    setRoomCharacterStyle(style) {
        if (style !== null && !['quaternius', 'diverse'].includes(style)) return false;
        const state = this._initCharacterStyles();
        if (state.room === style) return false;
        state.room = style;
        this._queueCharacterStyle();
        return true;
    },

    retryCharacterStyle() {
        return this._queueCharacterStyle();
    },

    _characterStylesChanged() {
        if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent('characterstylechange'));
        if (this._vrQuickMenuRoot && this._vrQuickMenuRoot.isEnabled()) this._refreshVRQuickMenu();
    },

    _queueCharacterStyle() {
        const state = this._initCharacterStyles();
        const change = async () => {
            await this.initPromise;
            if (this._disposed) return false;
            const wanted = this._wantedCharacterStyle();
            if (wanted === state.applied) { state.error = null; this._characterStylesChanged(); return true; }
            state.loading = wanted;
            state.error = null;
            this._characterStylesChanged();
            try {
                await this._replaceCharacterStyle(wanted);
                return true;
            } catch (error) {
                state.error = error.message;
                log.warn('Character style change failed:', error);
                this.showErrorMessage(`Characters could not be changed: ${error.message}. Use Retry characters or choose lightweight characters.`);
                this._releaseCharacterStyleSources(wanted);
                return false;
            } finally {
                state.loading = null;
                this._characterStylesChanged();
            }
        };
        state.queue = (state.queue || Promise.resolve()).then(change);
        return state.queue;
    },

    characterLabel(id) {
        if (this.getCharacterStyle() === 'diverse') {
            const person = window.CharacterCatalog.people[window.CharacterCatalog.players[id]];
            if (person) return person.label;
        }
        return (window.ClubMultiplayer && window.ClubMultiplayer.AVATAR_LABELS[id]) || id;
    },

    _characterSource(index, style = this.getCharacterStyle()) {
        const source = window.VRClubAudioCrowd.AVATAR_SOURCES[index];
        if (!source) throw new RangeError(`Unknown character source ${index}.`);
        const person = style === 'diverse' && window.CharacterCatalog.people[window.CharacterCatalog.npcs[source.id]];
        return person ? { ...source, url: person.url, garmentColor: null } : source;
    },

    _characterDJLook(id, style = this.getCharacterStyle()) {
        const person = style === 'diverse' && window.CharacterCatalog.people[window.CharacterCatalog.npcs[`dj-${id}`]];
        return person ? { url: person.url, height: person.height } : window.VRClubAudioCrowd.djLook(id);
    },

    _loadCharacterContainer(source, style) {
        const state = this._initCharacterStyles();
        let record = state.sources.get(source.url);
        if (!record) {
            record = { style, retired: false, container: null };
            record.promise = this._loadAvatarSource(source.url, source.garmentColor || source.garment, source.hair).then(container => {
                record.container = container;
                if (record.retired || this._disposed) {
                    if (container) {
                        this._avatarContainers = this._avatarContainers.filter(item => item !== container);
                        container.dispose();
                    }
                    return null;
                }
                if (!container) state.sources.delete(source.url);
                return container;
            });
            state.sources.set(source.url, record);
        }
        return record.promise;
    },

    _loadPlayerSource(id, style = this.getCharacterStyle()) {
        const index = window.VRClubAudioCrowd.sourceIndex(id);
        if (index < 0) return Promise.resolve(null);
        const person = style === 'diverse' && window.CharacterCatalog.people[window.CharacterCatalog.players[id]];
        return person ? this._loadCharacterContainer(person, style) : this._loadCharacterContainer(this._characterSource(index, style), style);
    },

    _releaseCharacterStyleSources(style) {
        const state = this._initCharacterStyles();
        if (state.applied === style) return;
        for (const [url, record] of state.sources) {
            if (record.style !== style || /club-dancer-(female|male)\.glb$/.test(url)) continue;
            record.retired = true;
            if (record.container) {
                this._avatarContainers = this._avatarContainers.filter(item => item !== record.container);
                record.container.dispose();
            }
            state.sources.delete(url);
        }
    },

    async _replaceCharacterStyle(style) {
        const state = this._initCharacterStyles();
        const Crowd = window.VRClubAudioCrowd;
        const indices = new Set(this._requiredCrowdSources());
        if (style === 'quaternius') { indices.add(0); indices.add(1); }
        const actors = (this.npcAvatars || []).slice();
        for (const npc of actors) {
            const index = Crowd.sourceIndex(npc.characterSourceId);
            if (index >= 0) indices.add(index);
        }
        const containers = new Array(Crowd.AVATAR_SOURCES.length);
        for (const index of indices) {
            if (this._disposed || style !== this._wantedCharacterStyle()) {
                this._releaseCharacterStyleSources(style);
                return;
            }
            const source = this._characterSource(index, style);
            const container = await this._loadCharacterContainer(source, style);
            if (!container) throw new Error(`Could not load ${source.id}.`);
            containers[index] = container;
        }
        const djId = this._djWanted || this._djId || this._initialDJId();
        const djLook = this._characterDJLook(djId, style);
        const dj = actors.find(npc => npc.name === 'djPerformer');
        const djContainer = dj && await this._loadCharacterContainer(djLook, style);
        if (dj && !djContainer) throw new Error('Could not load the selected DJ.');
        const me = this._mirrorAvatarId() || (this.getLocalAvatarStyle() === 'male' ? 'm1' : 'f1');
        const playerIds = new Set([me]);
        if (this.avatarManager) for (const peer of this.avatarManager.remotes.values()) playerIds.add(peer.avatarId);
        for (const id of playerIds) if (id && !await this._loadPlayerSource(id, style)) throw new Error(`Could not load player ${id}.`);
        if (this._disposed || style !== this._wantedCharacterStyle()) {
            this._releaseCharacterStyleSources(style);
            return;
        }

        // Build every replacement before touching a live actor. A refused rig leaves the current cast intact.
        const globals = Object.fromEntries(Object.keys(this).filter(key => /^_(bartender|dj)/.test(key)).map(key => [key, this[key]]));
        const replacements = [];
        try {
            for (const npc of actors) {
                const before = this.npcAvatars.length;
                if (npc.name === 'djPerformer') {
                    if (!this._spawnPerformingDJ(djContainer, djLook)) throw new Error('The new DJ rig is incompatible.');
                } else if (npc.name === 'bartender' && npc.rig) {
                    if (!this._spawnWorkingBartender(containers[Crowd.sourceIndex('bartender')])) throw new Error('The new bartender rig is incompatible.');
                } else {
                    const spec = npc.characterSpawn;
                    if (!spec) throw new Error(`Missing model ownership for ${npc.name}.`);
                    const position = npc.root.position.clone();
                    position.y -= spec.floorOffset;
                    this._spawnAvatar(containers[Crowd.sourceIndex(npc.characterSourceId)], npc.name, position,
                        npc.root.rotation.y, spec.height, npc.baseSpeed, spec.options);
                }
                const next = this.npcAvatars[before];
                if (!next || next.name !== npc.name) throw new Error(`Could not prepare ${npc.name}.`);
                this.npcAvatars.splice(before, 1);
                replacements.push({ npc, next });
            }
        } catch (error) {
            for (const { next } of replacements) this._disposeCharacterNPC(next);
            Object.assign(this, globals);
            throw error;
        }
        const nextBartenderRig = this._bartenderRig, nextDJRig = this._djRig;
        Object.assign(this, globals);
        const oldStyle = state.applied;
        state.applied = style;
        state.generation++;
        this._crowdSourceContainers = containers;
        this._crowdSourcePending = {};
        this._availableCrowdSources = containers.filter(Boolean);
        this._djContainers = {};
        this._disposeMirrorDouble();
        if (this.avatarManager) this.avatarManager.refreshCharacterStyle();
        for (const { npc, next } of replacements) {
            this._replaceCharacterNPC(npc, next);
        }
        if (nextBartenderRig && nextBartenderRig !== globals._bartenderRig) {
            this._bartenderRig = nextBartenderRig;
            this._bartenderNpc = actors.find(npc => npc.name === 'bartender');
        }
        if (nextDJRig && nextDJRig !== globals._djRig) {
            this._djRig = nextDJRig;
            this._djEntry = { dispose: () => nextDJRig.dispose() };
            this._djPerformer.eye = djLook.height * 0.93;
        }
        this._djCharacterStyle = style;
        this._rebindCharacterProps();
        this._spawnLocalPlayerBody();
        this._syncMirrorDouble();
        this._refreshContactShadows();
        this._refreshShadowCasters();
        this._releaseCharacterStyleSources(oldStyle);
    },

    _disposeCharacterNPC(npc) {
        if (npc.collider) npc.collider.dispose();
        if (npc.rig) npc.rig.dispose();
        else if (npc.characterEntry) npc.characterEntry.dispose();
    },

    _replaceCharacterNPC(npc, next) {
        const enabled = npc.root.isEnabled();
        const oldMeshes = new Set(npc.meshes);
        for (const light of this.scene.lights) {
            if (!light.includedOnlyMeshes.some(mesh => oldMeshes.has(mesh))) continue;
            light.includedOnlyMeshes = light.includedOnlyMeshes.filter(mesh => !oldMeshes.has(mesh));
            this._extendAccentLight(light, next.meshes);
        }
        if (npc.smoke) {
            for (const key of ['wisp', 'exhale']) if (npc.smoke[key]) npc.smoke[key].dispose();
            for (const key of ['cigarette', 'ember', 'mouth', 'breath']) if (npc.smoke[key]) npc.smoke[key].dispose();
            npc.smoke = null;
            npc.smokeProp = null;
        }
        const current = npc.animations[0];
        const clip = current && current.name.slice(npc.name.length + 1);
        const phase = current && current.animatables[0] ? current.animatables[0].masterFrame : null;
        const speed = current ? current.speedRatio : npc.baseSpeed;
        if (npc.dance && next.dance) Object.assign(next.dance, { ...npc.dance, groups: next.dance.groups, current: next.dance.current });
        const models = ['root', 'meshes', 'animations', 'rig', 'collider', 'character', 'characterEntry', 'characterSourceId', 'characterSpawn', 'dance', 'poses'];
        this._disposeCharacterNPC(npc);
        for (const key of models) {
            if (key in next) npc[key] = next[key];
            else delete npc[key];
        }
        const groups = npc.poses ? npc.poses.groups : npc.dance ? npc.dance.groups : null;
        if (groups && groups.has(clip)) {
            for (const group of groups.values()) group.stop();
            const group = groups.get(clip);
            group.start(true, speed);
            if (Number.isFinite(phase)) group.goToFrame(Math.min(group.to, Math.max(group.from, phase)));
            npc.animations = [group];
            if (npc.poses) npc.poses.current = group;
            if (npc.dance) npc.dance.current = group;
        }
        npc.root.setEnabled(enabled);
        if (npc.collider) npc.collider.setEnabled(enabled);
        window.VRClubAudioCrowd._setAnimating(npc, enabled);
    },

    _rebindCharacterProps() {
        const glass = this._barGlass;
        const find = (npc, suffix) => npc && npc.root.getChildTransformNodes(false).find(node => node.name.endsWith(suffix));
        if (glass) {
            const bartender = glass.bartender;
            glass.serverWrist = find(bartender, `hand_${bartender.rig && bartender.rig.sideL > 0 ? 'l' : 'r'}`);
            glass.minglerHand = find(this._mingler, 'Wrist.R') || null;
            glass.minglerWrist = find(this._mingler, 'Middle1.R') || null;
            glass.characterKnuckles = null;
        }
        if (this._barPatron && this._barPatron.barBottle) this._barPatron.barBottle.wrist = find(this._barPatron, 'Middle1.R');
        if (this._mingler) this._createMinglerSmoke(this._mingler);
    }
};
