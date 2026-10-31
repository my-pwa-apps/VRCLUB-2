'use strict';

class CustomAvatarAppearance {
    static _states = new WeakMap();
    static defaults() {
        return { v: 1, outfit: 'original', top: '#536781', bottom: '#292e38', glasses: 'none', hat: 'none' };
    }

    static sanitize(value) {
        if (!value || value.v !== 1 || !['original', 'casual', 'smart'].includes(value.outfit) ||
            !['none', 'round', 'square'].includes(value.glasses) || !['none', 'cap', 'beanie'].includes(value.hat) ||
            typeof value.top !== 'string' || typeof value.bottom !== 'string' ||
            !/^#[0-9a-f]{6}$/i.test(value.top) || !/^#[0-9a-f]{6}$/i.test(value.bottom)) {
            throw new Error('Choose a valid uploaded-avatar outfit, colours and accessories.');
        }
        return { v: 1, outfit: value.outfit, top: value.top.toLowerCase(), bottom: value.bottom.toLowerCase(),
            glasses: value.glasses, hat: value.hat };
    }

    static key(value) { return JSON.stringify(this.sanitize(value)); }

    static _bone(name) {
        return name.replace(/^.*(?:mixamorig[:_]?|rig\d+_)/i, '').replace(/[^a-z0-9]/gi, '').toLowerCase();
    }

    static _fit(body, outfit) {
        const B = BABYLON.VertexBuffer;
        const positions = body.getVerticesData(B.PositionKind), joints = body.getVerticesData(B.MatricesIndicesKind);
        const weights = body.getVerticesData(B.MatricesWeightsKind), indices = body.getIndices();
        if (!positions || !joints || !weights || !indices || body.morphTargetManager ||
            positions.length / 3 > 150000 || body.numBoneInfluencers > 4) {
            throw new Error('This upload cannot be safely fitted: use an upright humanoid skin with at most four joint weights and no morph targets.');
        }
        const names = body.skeleton.bones.map(bone => this._bone(bone.name));
        const head = names.findIndex(name => name === 'head');
        if (head < 0 || !names.includes('hips') || !names.includes('spine') ||
            !names.includes('leftupleg') || !names.includes('rightupleg')) {
            throw new Error('Fitted clothing needs named humanoid head, hips, spine and leg joints. The original upload is unchanged.');
        }
        let low = Infinity, high = -Infinity;
        for (let i = 1; i < positions.length; i += 3) { low = Math.min(low, positions[i]); high = Math.max(high, positions[i]); }
        const height = high - low;
        if (!(height > 0.5 && height < 3)) throw new Error('Fitting needs an upright, metre-scale uploaded body.');
        const region = vertex => {
            let top = 0, bottom = 0, protectedWeight = 0;
            for (let j = 0; j < 4; j++) {
                const weight = weights[vertex * 4 + j], name = names[joints[vertex * 4 + j]] || '';
                if (!Number.isFinite(weight) || weight < 0) throw new Error('Uploaded skin weights are invalid.');
                if (/head|neck|hand|finger|thumb|foot|toe/.test(name)) protectedWeight += weight;
                if (/^spine\d*$|shoulder|^(left|right)arm$/.test(name) ||
                    (outfit === 'smart' && /forearm/.test(name))) top += weight;
                if (/hips|upleg|^(left|right)leg$/.test(name)) bottom += weight;
            }
            const y = (positions[vertex * 3 + 1] - low) / height;
            if (protectedWeight > 0.15) return 'original';
            if (y > 0.48 && y < 0.86 && top > 0.6) return 'top';
            if (y > 0.08 && y < 0.58 && bottom > 0.6) return 'bottom';
            return 'original';
        };
        const groups = { original: [], top: [], bottom: [] };
        for (let i = 0; i < indices.length; i += 3) {
            const a = region(indices[i]), b = region(indices[i + 1]), c = region(indices[i + 2]);
            // Never replace a triangle touching a face, hand or shoe, even at a weighted seam.
            const group = a === b && b === c ? a : 'original';
            groups[group].push(indices[i], indices[i + 1], indices[i + 2]);
        }
        if (groups.top.length < 30 || groups.bottom.length < 30 || !groups.original.length) {
            throw new Error('This upload has no safely separable shirt and trouser surfaces. The original upload is unchanged.');
        }
        return { groups, head, low, height };
    }

    static _mesh(body, indices, name, offset = 0) {
        const mesh = new BABYLON.Mesh(name, body.getScene());
        try {
            const source = BABYLON.VertexData.ExtractFromMesh(body, true, true);
            const data = new BABYLON.VertexData(), remap = new Map();
            data.indices = indices.map(index => {
                if (!remap.has(index)) remap.set(index, remap.size);
                return remap.get(index);
            });
            for (const [key, stride] of Object.entries({ positions: 3, normals: 3, tangents: 4, uvs: 2, uvs2: 2,
                uvs3: 2, uvs4: 2, uvs5: 2, uvs6: 2, colors: 4, matricesIndices: 4, matricesWeights: 4 })) {
                if (!source[key]) continue;
                data[key] = [];
                for (const index of remap.keys()) {
                    for (let j = 0; j < stride; j++) {
                        let value = source[key][index * stride + j];
                        if (key === 'positions' && offset) value += (source.normals?.[index * 3 + j] || 0) * offset;
                        data[key].push(value);
                    }
                }
            }
            if (indices.length) data.applyToMesh(mesh);
            mesh.parent = body.parent;
            mesh.position.copyFrom(body.position);
            mesh.scaling.copyFrom(body.scaling);
            mesh.rotation.copyFrom(body.rotation);
            mesh.rotationQuaternion = body.rotationQuaternion?.clone() || null;
            mesh.skeleton = body.skeleton;
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true;
            mesh.layerMask = body.layerMask;
            mesh.receiveShadows = body.receiveShadows;
            mesh.isVisible = body.isVisible;
            mesh.metadata = { vrclubCustomAppearance: true };
            return mesh;
        } catch (error) { mesh.dispose(false, false); throw error; }
    }

    static apply(rig, value) {
        const descriptor = this.sanitize(value), key = this.key(descriptor), old = this._states.get(rig);
        if (old?.key === key) return { descriptor, meshes: old.meshes };
        const originals = old?.originals || (rig.meshes || []).filter(mesh => mesh.skeleton && mesh.getTotalVertices() &&
            !mesh.metadata?.vrclubCustomAppearance);
        if (originals.length !== 1) {
            if (descriptor.outfit === 'original' && descriptor.hat === 'none' && descriptor.glasses === 'none') {
                this.dispose(rig); return { descriptor, meshes: [] };
            }
            throw new Error('Customization currently supports one skinned humanoid body mesh. The original upload is unchanged.');
        }
        const body = originals[0], factory = rig.club?.materialFactory || rig.materialFactory;
        const next = { key, descriptor, originals, meshes: [], materials: [], enabled: old?.enabled ?? body.isEnabled(false) };
        try {
            if (descriptor.outfit !== 'original') {
                if (!factory) throw new Error('The avatar material factory is unavailable.');
                const fit = this._fit(body, descriptor.outfit);
                const skin = this._mesh(body, fit.groups.original, `${body.name}_custom_skin`);
                skin.material = body.material;
                next.meshes.push(skin);
                for (const part of ['top', 'bottom']) {
                    const mesh = this._mesh(body, fit.groups[part], `${body.name}_custom_${part}`,
                        fit.height * (descriptor.outfit === 'smart' ? 0.005 : 0.003));
                    next.meshes.push(mesh);
                    const color = BABYLON.Color3.FromHexString(descriptor[part]).toLinearSpace();
                    const material = factory.createPBRMaterial(`${body.name}_custom_${part}_${key}`, {
                        baseColor: color.asArray(), metallic: 0, roughness: descriptor.outfit === 'smart' ? 0.72 : 0.92,
                        mutable: true, backFaceCulling: false
                    }, false);
                    next.materials.push(material);
                    material.maxSimultaneousLights = rig.club?.maxLights || body.material?.maxSimultaneousLights || 3;
                    material.alpha = 1; material.transparencyMode = 0; material.disableDepthWrite = false;
                    material.needAlphaBlending = () => false;
                    mesh.useVertexColors = false;
                    mesh.material = material;
                }
            }
            if (descriptor.glasses !== 'none' || descriptor.hat !== 'none') {
                if (!factory || !window.AvatarDetails) throw new Error('Uploaded-avatar accessories are unavailable.');
                const fit = this._fit(body, 'smart');
                const p = body.getVerticesData(BABYLON.VertexBuffer.PositionKind);
                const j = body.getVerticesData(BABYLON.VertexBuffer.MatricesIndicesKind);
                const w = body.getVerticesData(BABYLON.VertexBuffer.MatricesWeightsKind);
                const headPoints = [];
                for (let i = 0; i < p.length / 3; i++) {
                    let weight = 0;
                    for (let k = 0; k < 4; k++) if (j[i * 4 + k] === fit.head) weight += w[i * 4 + k];
                    if (weight > 0.7) headPoints.push([p[i * 3], p[i * 3 + 1], p[i * 3 + 2]]);
                }
                if (headPoints.length < 30) throw new Error('The upload has no measured head surface for accessories.');
                const min = Math.min(...headPoints.map(point => point[1])), max = Math.max(...headPoints.map(point => point[1]));
                const eye = [0, min + (max - min) * 0.62, 0];
                const face = window.AvatarDetails._face(body, eye);
                const geometry = window.AvatarDetails._geometry(face, descriptor);
                const mesh = this._mesh(body, [], `${body.name}_custom_accessories`);
                mesh.metadata.vrclubCustomAccessory = true;
                next.meshes.push(mesh);
                const data = Object.assign(new BABYLON.VertexData(), geometry);
                data.matricesIndices = []; data.matricesWeights = [];
                for (let i = 0; i < data.positions.length / 3; i++) {
                    data.matricesIndices.push(fit.head, 0, 0, 0); data.matricesWeights.push(1, 0, 0, 0);
                }
                data.normals = [];
                BABYLON.VertexData.ComputeNormals(data.positions, data.indices, data.normals);
                data.applyToMesh(mesh);
                mesh.material = factory.createPBRMaterial(`${body.name}_custom_accessory`, {
                    baseColor: [1, 1, 1], metallic: 0.12, roughness: 0.7, mutable: true, backFaceCulling: false
                }, false);
                next.materials.push(mesh.material);
                mesh.material.maxSimultaneousLights = rig.club?.maxLights || 3;
            }
        } catch (error) { this._release(next); throw error; }
        if (old) {
            rig.meshes = (rig.meshes || []).filter(mesh => !old.meshes.includes(mesh));
            if (rig.headMeshes) rig.headMeshes = rig.headMeshes.filter(mesh => !old.meshes.includes(mesh));
            this._release(old);
        }
        body.setEnabled(descriptor.outfit === 'original' && next.enabled);
        for (const mesh of next.meshes) mesh.setEnabled(next.enabled);
        rig.meshes = (rig.meshes || []).filter(mesh => !mesh.metadata?.vrclubCustomAppearance);
        rig.meshes.push(...next.meshes);
        if (rig.headMeshes?.length) {
            rig.headMeshes = rig.headMeshes.filter(mesh => !mesh.metadata?.vrclubCustomAppearance);
            for (const mesh of next.meshes.filter(mesh => mesh.metadata?.vrclubCustomAccessory)) {
                mesh.isVisible = rig._headVisible !== false;
                rig.headMeshes.push(mesh);
            }
        }
        this._states.set(rig, next);
        if (rig.club) rig.club._mirrorSignature = null;
        return { descriptor, meshes: next.meshes };
    }

    static _release(state) {
        state.meshes.forEach(mesh => mesh.dispose(false, false));
        state.materials.forEach(material => material.dispose(false, false));
    }

    static dispose(rig) {
        const state = this._states.get(rig);
        if (!state) return;
        rig.meshes = (rig.meshes || []).filter(mesh => !state.meshes.includes(mesh));
        if (rig.headMeshes) rig.headMeshes = rig.headMeshes.filter(mesh => !state.meshes.includes(mesh));
        this._release(state);
        state.originals.forEach(mesh => { if (!mesh.isDisposed()) mesh.setEnabled(state.enabled); });
        this._states.delete(rig);
        if (rig.club) rig.club._mirrorSignature = null;
    }
}

window.CustomAvatarAppearance = CustomAvatarAppearance;
