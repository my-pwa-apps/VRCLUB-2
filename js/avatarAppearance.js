'use strict';

class AvatarAppearance {
    static STORAGE_KEY = 'vrclub.personalAppearance';
    static FIELDS = ['v', 'base', 'hair', 'outfit', 'skin', 'hairColor', 'top', 'bottom'];
    static ACCESSORIES = {
        glasses: ['none', 'round', 'square', 'heart', 'star', 'sunglasses'],
        facialHair: ['none', 'stubble', 'beard'],
        hat: ['none', 'cap', 'beanie', 'fedora', 'bucket']
    };
    static FOOTWEAR = {
        shoes: ['original', 'loafers', 'pumps', 'heels'],
        legwear: ['bare', 'sheer-black', 'sheer-nude']
    };
    static KEYS = new WeakMap();
    static sanitize(value) {
        if (value === null) return null;
        const fields = [...this.FIELDS, ...(value?.v >= 2 ? Object.keys(this.ACCESSORIES) : []),
            ...(value?.v === 3 ? Object.keys(this.FOOTWEAR) : [])];
        if (!value || typeof value !== 'object' || Array.isArray(value) ||
            Object.keys(value).length !== fields.length || fields.some(key => !Object.hasOwn(value, key)) ||
            ![1, 2, 3].includes(value.v) || !/^(f[1-8]|m[1-9])$/.test(value.base) ||
            !(value.v >= 2 ? ['original', 'short', 'long', 'bald'] : ['original', 'short', 'long']).includes(value.hair) ||
            !['original', 'casual', 'smart'].includes(value.outfit)) throw new TypeError('Choose a valid character, hairstyle and outfit.');
        const result = { v: value.v, base: value.base, hair: value.hair, outfit: value.outfit };
        for (const key of ['skin', 'hairColor', 'top', 'bottom']) {
            if (typeof value[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(value[key])) throw new TypeError('Choose a valid six-digit colour.');
            result[key] = value[key].toLowerCase();
        }
        if (value.v >= 2) for (const [key, options] of Object.entries(this.ACCESSORIES)) {
            if (value.v === 2 && key === 'facialHair' && ['moustache', 'handlebar'].includes(value[key])) {
                result[key] = 'none';
                continue;
            }
            if (value.v === 2 && key === 'hat' && value[key] === 'party') {
                result[key] = 'bucket';
                continue;
            }
            if (!options.includes(value[key])) throw new TypeError('Choose valid glasses, facial hair and headwear.');
            result[key] = value[key];
        }
        if (value.v === 3) for (const [key, options] of Object.entries(this.FOOTWEAR)) {
            if (!options.includes(value[key])) throw new TypeError('Choose valid shoes and legwear.');
            result[key] = value[key];
        }
        return result;
    }

    static defaults(base = 'f1') {
        const skin = { f1: '#966141', f2: '#a66c49', f3: '#dfb796', f4: '#e6bc9f',
            f5: '#d0a07c', f6: '#a77452', f7: '#c29c7c', f8: '#d6a582',
            m1: '#bc987c', m2: '#deb38e', m3: '#d1a17e', m4: '#cfac92', m5: '#d0af94',
            m6: '#966141', m7: '#c29c7c', m8: '#c6a080', m9: '#966141' };
        return this.sanitize({ v: 1, base, hair: 'original', outfit: 'original',
            skin: skin[base], hairColor: '#392a20', top: '#385e80', bottom: '#263448' });
    }

    static key(value) {
        if (!value) return '';
        // Membership and saved records are replaced, never edited in place; the mirror reads this every frame.
        let key = this.KEYS.get(value);
        if (key === undefined) {
            key = JSON.stringify(this.sanitize(value));
            this.KEYS.set(value, key);
        }
        return key;
    }

    static prepare(container, maxLights = 3) {
        for (const group of container.animationGroups) group.stop();
        for (const mesh of container.meshes) if (/wardrobe_skin_/.test(mesh.name)) {
            mesh.useVertexColors = false;
            mesh.hasVertexAlpha = false;
        }
        for (const material of container.materials) {
            const hair = material.name.startsWith('wardrobe_hair_');
            material.maxSimultaneousLights = maxLights;
            material.alpha = 1;
            material.transparencyMode = hair ? BABYLON.Material.MATERIAL_ALPHATEST : BABYLON.Material.MATERIAL_OPAQUE;
            material.needAlphaBlending = () => false;
            material.needAlphaTesting = () => hair;
            material.disableDepthWrite = false;
            material.backFaceCulling = !hair;
            if (hair) {
                material.useAlphaFromAlbedoTexture = true;
                material.alphaCutOff = 0.45;
                if (material.albedoTexture) material.albedoTexture.hasAlpha = true;
            }
        }
    }

    static instantiate(container, prefix, value, factory) {
        const appearance = this.sanitize(value);
        const catalog = window.WardrobeCatalog[appearance.base];
        if (appearance.v === 3 && (!catalog?.footwearMasks || !catalog.footwear?.includes(appearance.shoes))) {
            throw new Error('This character needs updated footwear assets.');
        }
        const entry = container.instantiateModelsToScene(name => `${prefix}${name}`, false, { doNotInstantiate: true });
        const materials = new Map();
        const meshes = entry.rootNodes.flatMap(root => root.getChildMeshes());
        const skins = new Map();
        for (const mesh of meshes) {
            const source = mesh.material;
            if (!source) continue;
            let material = materials.get(source);
            if (!material) {
                material = factory.createPBRMaterial(`${prefix}${source.name}`, {
                    baseColor: [1, 1, 1], metallic: 0, roughness: 0.83, mutable: true,
                    backFaceCulling: !source.name.startsWith('wardrobe_hair_')
                });
                material.baseTexture = source.albedoTexture;
                const hair = source.name.startsWith('wardrobe_hair_');
                material.transparencyMode = hair ? BABYLON.Material.MATERIAL_ALPHATEST : BABYLON.Material.MATERIAL_OPAQUE;
                material.needAlphaBlending = () => false;
                material.needAlphaTesting = () => hair;
                material.disableDepthWrite = false;
                material.forceDepthWrite = true;
                material.alphaCutOff = 0.45;
                materials.set(source, material);
            }
            mesh.material = material;
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true;
            if (/wardrobe_skin_/.test(mesh.name) && catalog?.footwearMasks) {
                const flags = mesh.getVerticesData(BABYLON.VertexBuffer.ColorKind);
                if (!flags || flags.length !== mesh.getTotalVertices() * 4) {
                    entry.dispose();
                    for (const owned of materials.values()) owned.dispose(false, false);
                    throw new Error('This character is missing its footwear skin masks.');
                }
                const joints = mesh.getVerticesData(BABYLON.VertexBuffer.MatricesIndicesKind);
                const weights = mesh.getVerticesData(BABYLON.VertexBuffer.MatricesWeightsKind);
                const legBones = new Set(mesh.skeleton.bones.filter(bone =>
                    /^(upperleg|lowerleg|thigh|calf|foot|toe)[_.]/i.test(bone.name)).map(bone => bone.getIndex()));
                const legs = new Float32Array(mesh.getTotalVertices());
                for (let vertex = 0; vertex < legs.length; vertex++) {
                    for (let slot = 0; slot < 4; slot++) {
                        if (legBones.has(joints[vertex * 4 + slot])) legs[vertex] += weights[vertex * 4 + slot];
                    }
                }
                skins.set(mesh, { flags: Float32Array.from(flags), indices: Array.from(mesh.getIndices()), legs,
                    shoes: null, legwear: null });
                mesh.makeGeometryUnique();
            }
        }
        const details = window.AvatarDetails.create(meshes, window.WardrobeCatalog[appearance.base], factory, prefix);
        const update = draft => {
            const next = this.sanitize(draft);
            if (next.base !== appearance.base) throw new Error('Load the selected base before applying its wardrobe.');
            for (const [source, material] of materials) {
                const key = source.name.startsWith('wardrobe_skin') ? 'skin' :
                    source.name.startsWith('wardrobe_hair_') ? 'hairColor' :
                    source.name.startsWith('wardrobe_top_') ? 'top' :
                    source.name.startsWith('wardrobe_bottom_') ? 'bottom' : null;
                if (key) material.baseColor.copyFrom(BABYLON.Color3.FromHexString(next[key]).toLinearSpace());
            }
            for (const mesh of meshes) {
                const hair = mesh.name.match(/wardrobe_hair_(original|short|long)/);
                const outfit = mesh.name.match(/wardrobe_outfit_(original|casual|smart)/);
                const skin = mesh.name.match(/wardrobe_skin_(original|casual|smart)/);
                const shoes = mesh.name.match(/wardrobe_shoes_(original|loafers|pumps|heels)/);
                const skinData = skins.get(mesh);
                if (skinData) this._updateSkin(mesh, skinData, next.shoes || 'original', next.legwear || 'bare');
                mesh.setEnabled((!hair || (hair[1] === next.hair && (!next.hat || next.hat === 'none'))) && (!outfit || outfit[1] === next.outfit) &&
                    (!skin || skin[1] === next.outfit) && (!shoes || shoes[1] === (next.shoes || 'original')));
            }
            details.update(next);
        };
        update(appearance);
        const originalDispose = entry.dispose.bind(entry);
        let disposed = false;
        entry.dispose = () => {
            if (disposed) return;
            disposed = true;
            originalDispose();
            for (const material of materials.values()) material.dispose(false, false);
        };
        return { entry, root: entry.rootNodes[0], update, dispose: () => entry.dispose() };
    }

    static _updateSkin(mesh, data, shoes, legwear) {
        if (data.shoes !== shoes) {
            const channel = this.FOOTWEAR.shoes.indexOf(shoes), indices = [];
            for (let index = 0; index < data.indices.length; index += 3) {
                const visible = vertex => data.flags[vertex * 4 + channel] < 0.5;
                const triangle = data.indices.slice(index, index + 3);
                // Keep the ankle seam intact; the boot shaft covers its boundary triangles.
                if (shoes === 'heels' ? triangle.some(visible) : triangle.every(visible)) {
                    indices.push(data.indices[index], data.indices[index + 1], data.indices[index + 2]);
                }
            }
            mesh.setIndices(indices, mesh.getTotalVertices());
            data.shoes = shoes;
        }
        if (data.legwear !== legwear) {
            const tint = legwear === 'sheer-black' ? [0.45, 0.43, 0.46] :
                legwear === 'sheer-nude' ? [0.9, 0.84, 0.8] : [1, 1, 1];
            const colors = new Float32Array(data.legs.length * 4);
            for (let vertex = 0; vertex < data.legs.length; vertex++) {
                for (let channel = 0; channel < 3; channel++) {
                    colors[vertex * 4 + channel] = 1 + (tint[channel] - 1) * data.legs[vertex];
                }
                colors[vertex * 4 + 3] = 1;
            }
            mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, colors);
            mesh.useVertexColors = legwear !== 'bare';
            mesh.hasVertexAlpha = false;
            data.legwear = legwear;
        }
    }

    static async loadPreview(scene, value, prefix = 'wardrobePreview_') {
        const appearance = this.sanitize(value), source = window.WardrobeCatalog[appearance.base];
        if (!source) throw new Error('This character wardrobe is unavailable.');
        const container = await BABYLON.SceneLoader.LoadAssetContainerAsync('', source.url, scene);
        this.prepare(container);
        const factory = new MaterialFactory(scene, 3);
        let preview;
        try {
            preview = this.instantiate(container, prefix, appearance, factory);
            const node = preview.root;
            node.rotationQuaternion = null;
            node.rotation.set(0, Math.PI, 0);
            node.computeWorldMatrix(true);
            const bounds = node.getHierarchyBoundingVectors(true, mesh => !mesh.metadata?.vrclubAdornment);
            const scale = 1.75 / (bounds.max.y - bounds.min.y);
            node.scaling.setAll(scale);
            node.position.y = -bounds.min.y * scale;
            const idle = preview.entry.animationGroups.find(group => group.name.endsWith('Idle'));
            if (idle) idle.start(true);
            const dispose = preview.dispose;
            preview.dispose = () => { dispose(); container.dispose(); factory.dispose(); };
            return preview;
        } catch (error) {
            preview?.dispose();
            container.dispose();
            factory.dispose();
            throw error;
        }
    }
}

window.AvatarAppearance = AvatarAppearance;
window.PersonalAppearance = {
    getPersonalAppearance() {
        if (this._personalAppearanceLoaded) return this._personalAppearance;
        this._personalAppearanceLoaded = true;
        this._personalAppearance = null;
        try {
            const stored = localStorage.getItem(AvatarAppearance.STORAGE_KEY);
            if (stored) this._personalAppearance = Object.freeze(AvatarAppearance.sanitize(JSON.parse(stored)));
        } catch (error) {
            log.warn('Your saved wardrobe could not be read:', error);
            this.showErrorMessage('Your saved wardrobe could not be read. Open Edit my character to save it again.');
        }
        return this._personalAppearance;
    },

    getAppearanceDraft() {
        return { ...(this.getPersonalAppearance() || AvatarAppearance.defaults(this.getLocalCharacter() || 'f1')) };
    },

    _ownAppearance() {
        const mp = this.multiplayer;
        return mp?.connected ? mp.client.selfAppearance || null : this.getPersonalAppearance();
    },

    _appearanceAcknowledged(appearance) {
        const pending = this._appearancePending;
        if (pending && AvatarAppearance.key(appearance) === pending.key) pending.resolve();
        this._syncMirrorDouble();
        if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent('personalappearancechange'));
    },

    async _publishAppearance(appearance, base) {
        const mp = this.multiplayer;
        if (!mp?.connected) {
            if (mp?.client) mp.client.setPreferredAppearance(appearance);
            return;
        }
        if (!mp.client.appearanceSelectionSupported) throw new Error('This relay needs an update before it can share your wardrobe.');
        if (appearance?.v >= 2 && !mp.client.appearanceAccessoriesSupported) throw new Error('This relay needs an update before it can share bald styles and accessories.');
        if (appearance?.v === 3 && !mp.client.appearanceFootwearSupported) throw new Error('This relay needs an update before it can share shoes and tights.');
        if (this._appearancePending) throw new Error('Please wait for your previous appearance change.');
        await new Promise((resolve, reject) => {
            const finish = callback => () => {
                clearTimeout(pending.timer);
                this._appearancePending = null;
                callback();
            };
            const pending = { key: AvatarAppearance.key(appearance), resolve: null, reject: null };
            pending.resolve = finish(resolve);
            pending.reject = message => finish(() => reject(new Error(message)))();
            pending.timer = setTimeout(() => pending.reject('The room did not confirm your appearance. Try again.'), 10000);
            this._appearancePending = pending;
            if (!mp.client.selectAppearance(appearance, base)) pending.reject('Your appearance could not be sent to this room.');
        });
    },

    async savePersonalAppearance(draft) {
        this._personalAppearanceError = null;
        const previous = this.getPersonalAppearance();
        const client = this.multiplayer?.client;
        const shared = client?.selfAppearance || null, avatar = client?.avatar;
        let published = false;
        try {
            const appearance = AvatarAppearance.sanitize(draft);
            await this._loadWardrobeSource(appearance.base);
            if (this._disposed) return false;
            await this._publishAppearance(appearance, appearance.base);
            published = !!this.multiplayer?.connected;
            localStorage.setItem(AvatarAppearance.STORAGE_KEY, JSON.stringify(appearance));
            this._personalAppearance = Object.freeze(appearance);
            this._personalAppearanceLoaded = true;
            this.multiplayer?.client?.setPreferredAppearance(appearance);
            this.setLocalAvatarStyle(appearance.base[0] === 'm' ? 'male' : 'female');
            this._syncMirrorDouble();
            if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent('localcharacterchange'));
            return true;
        } catch (error) {
            let message = error.message;
            if (published && this.multiplayer?.connected) {
                try { await this._publishAppearance(shared, avatar); }
                catch (rollbackError) {
                    log.warn('The room appearance could not be restored:', rollbackError);
                    message += ` The room appearance could not be restored: ${rollbackError.message}`;
                }
            }
            this._personalAppearanceError = message;
            log.warn('Your wardrobe could not be saved:', error);
            this.showErrorMessage(`Your wardrobe could not be saved: ${message}`);
            if (this.multiplayer?.client) this.multiplayer.client.setPreferredAppearance(previous);
            this._scheduleWardrobeCleanup();
            return false;
        }
    },

    async resetPersonalAppearance() {
        this._personalAppearanceError = null;
        const client = this.multiplayer?.client;
        const shared = client?.selfAppearance || null, avatar = client?.avatar;
        let published = false;
        try {
            const previous = this.getPersonalAppearance();
            if (!previous) return true;
            await this._publishAppearance(null, previous.base);
            published = !!this.multiplayer?.connected;
            localStorage.setItem('vrclub.myCharacter', previous.base);
            localStorage.removeItem(AvatarAppearance.STORAGE_KEY);
            this._personalAppearance = null;
            this._personalAppearanceLoaded = true;
            this._syncMirrorDouble();
            if (typeof window.dispatchEvent === 'function') window.dispatchEvent(new CustomEvent('localcharacterchange'));
            return true;
        } catch (error) {
            let message = error.message;
            if (published && this.multiplayer?.connected) {
                try { await this._publishAppearance(shared, avatar); }
                catch (rollbackError) {
                    log.warn('The room appearance could not be restored:', rollbackError);
                    message += ` The room appearance could not be restored: ${rollbackError.message}`;
                }
            }
            this._personalAppearanceError = message;
            log.warn('Your wardrobe could not be reset:', error);
            this.showErrorMessage(`Your wardrobe could not be reset: ${message}`);
            return false;
        }
    },

    _loadWardrobeSource(id) {
        const source = window.WardrobeCatalog[id];
        if (!source) return Promise.reject(new Error('Unknown wardrobe base.'));
        if (!this._wardrobeSources) this._wardrobeSources = new Map();
        let record = this._wardrobeSources.get(id);
        if (!record) {
            record = { promise: null, container: null, users: 0 };
            record.promise = this._loadAvatarSource(source.url).then(container => {
                if (!container) throw new Error(`The wardrobe for ${source.label} could not be loaded.`);
                if (this._disposed) {
                    this._avatarContainers = this._avatarContainers.filter(item => item !== container);
                    container.dispose();
                    throw new Error('The club has closed.');
                }
                AvatarAppearance.prepare(container, this.maxLights);
                container.character = source;
                container._wardrobeRecord = record;
                record.container = container;
                return container;
            }).catch(error => {
                this._wardrobeSources.delete(id);
                throw error;
            });
            this._wardrobeSources.set(id, record);
        }
        return record.promise;
    },

    _scheduleWardrobeCleanup() {
        if (this._wardrobeCleanupTimer || this._disposed) return;
        this._wardrobeCleanupTimer = setTimeout(() => {
            this._wardrobeCleanupTimer = null;
            for (const [id, record] of this._wardrobeSources || []) {
                if (!record.container || record.users) continue;
                this._wardrobeSources.delete(id);
                this._avatarContainers = this._avatarContainers.filter(container => container !== record.container);
                record.container.dispose();
            }
        }, 1000);
    },

    _instantiatePlayer(container, prefix, appearance) {
        if (!appearance) {
            const entry = container.instantiateModelsToScene(name => `${prefix}${name}`, false, { doNotInstantiate: true });
            if (container.character) window.AvatarDetails.applyNPC(entry.rootNodes.flatMap(root => root.getChildMeshes()), container.character, this.materialFactory, prefix);
            return entry;
        }
        const entry = AvatarAppearance.instantiate(container, prefix, appearance, this.materialFactory).entry;
        const record = container._wardrobeRecord;
        if (record) {
            record.users++;
            const dispose = entry.dispose.bind(entry);
            let disposed = false;
            entry.dispose = () => {
                if (disposed) return;
                disposed = true;
                dispose();
                record.users--;
                this._scheduleWardrobeCleanup();
            };
        }
        return entry;
    }
};
