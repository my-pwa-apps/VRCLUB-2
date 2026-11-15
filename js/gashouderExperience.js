'use strict';

(function () {
    const DURATION_MS = 180000;
    const SHADER = 'gashouderPersonalEffect';
    const FRAGMENT = `
        precision mediump float;
        varying vec2 vUV;
        uniform sampler2D textureSampler;
        void main(void) {
            vec4 source = texture2D(textureSampler, vUV);
            float edge = smoothstep(0.30, 0.72, length(vUV - vec2(0.5)));
            float pattern = 0.5 + 0.5 * cos((vUV.x + vUV.y) * 55.0);
            vec3 tint = source.rgb * vec3(1.025, 0.985, 1.035) * (1.0 + edge * pattern * 0.006);
            gl_FragColor = vec4(mix(source.rgb, tint, 0.45), source.a);
        }
    `;

    const GashouderExperience = {
        createGashouderExperienceProps(layout) {
            const builder = this._dressingBuilder('gashouderExperience');
            const tabletMaterial = this.materialFactory.createPBRMaterial('gashouderTablets', {
                baseColor: [0.72, 0.65, 0.55], metallic: 0, roughness: 0.8
            }, true);
            const tablets = builder.group('Tablets', tabletMaterial);
            for (const place of layout) {
                for (const [dx, dz] of [[-0.09, 0.02], [0, -0.07], [0.09, 0.03]]) {
                    builder.cylinder(tablets, 0.028, 0.012, place.x + dx, 1.076, place.z + dz, 'y', 12);
                }
            }
            const texture = new BABYLON.DynamicTexture('gashouderExperienceCardTexture',
                { width: 512, height: 256 }, this.scene, false);
            const ctx = texture.getContext();
            ctx.fillStyle = '#111820'; ctx.fillRect(0, 0, 512, 256);
            ctx.textAlign = 'center';
            ctx.fillStyle = '#f2f2ef'; ctx.font = 'bold 43px sans-serif';
            ctx.fillText('SIMULATED EFFECT', 256, 91);
            ctx.fillStyle = '#a7d6d3'; ctx.font = '32px sans-serif';
            ctx.fillText('SELECT FOR DETAILS', 256, 167);
            texture.update(false);
            const cardMaterial = this.materialFactory.createPBRMaterial('gashouderExperienceCard', {
                baseColor: [0, 0, 0], metallic: 0, roughness: 1
            }, false);
            cardMaterial.unlit = true;
            cardMaterial.albedoTexture = texture;
            cardMaterial.emissiveTexture = texture;
            cardMaterial.emissiveColor.set(0.5, 0.5, 0.5);
            const cards = builder.group('Cards', cardMaterial);
            for (const place of layout) {
                const card = BABYLON.MeshBuilder.CreatePlane('gashouderExperienceCardPart',
                    { width: 0.32, height: 0.16, sideOrientation: BABYLON.Mesh.DOUBLESIDE }, this.scene);
                card.rotation.x = Math.PI / 2;
                card.position.set(place.x, 1.076, place.z + 0.19);
                builder.add(cards, card);
            }
            const meshes = builder.finish();
            for (const mesh of Object.values(meshes)) {
                mesh.isPickable = true;
                mesh.metadata = { ...(mesh.metadata || {}), vrclubGashouderExperience: true };
            }
            this._gashouderExperienceTexture = texture;
        },

        pressGashouderExperience(pick) {
            if (!pick?.pickedMesh?.metadata?.vrclubGashouderExperience) return false;
            if (this._immersive?.menuLocked()) return true;
            if (this.isInVRMode) {
                this.toggleVRQuickMenu(true);
                this._showVRQuickMenuPage('gashouderExperience');
            } else {
                const dialog = document.getElementById('gashouderEffectDialog');
                const start = document.getElementById('gashouderEffectStart');
                const cancel = document.getElementById('gashouderEffectCancel');
                const active = !!this._gashouderExperience?.active;
                start.textContent = active ? 'Stop effect' : 'Start effect';
                start.onclick = () => {
                    dialog.close();
                    if (active) this.stopGashouderExperience();
                    else this.startGashouderExperience();
                };
                cancel.onclick = () => dialog.close();
                if (!dialog.open) dialog.showModal();
            }
            return true;
        },

        _syncGashouderExperienceCamera(camera) {
            const state = this._gashouderExperience;
            if (!state?.active) return;
            if (!camera) throw new Error('The active camera is unavailable.');
            if (state.pass) {
                state.pass.dispose(state.camera);
                state.pass = null;
            }
            BABYLON.Effect.ShadersStore[`${SHADER}PixelShader`] = FRAGMENT;
            state.camera = camera;
            state.pass = new BABYLON.PostProcess('gashouderPersonalEffect', SHADER, null, null, 1, camera);
        },

        _gashouderExperienceAudio() {
            const ctx = this.audioContext;
            if (!ctx || !this.voiceDuckGain || !this.audioMasterGain || ctx.state === 'closed' ||
                this._audioKind === 'soundcloud') return null;
            if (this._gashouderExperienceFilter) return this._gashouderExperienceFilter;
            const filter = ctx.createBiquadFilter();
            filter.type = 'lowshelf';
            filter.frequency.value = 300;
            filter.gain.value = 0;
            let connected = false;
            try {
                filter.connect(this.audioMasterGain);
                this.voiceDuckGain.connect(filter);
                connected = true;
                this.voiceDuckGain.disconnect(this.audioMasterGain);
            } catch (error) {
                if (connected) this.voiceDuckGain.disconnect(filter);
                filter.disconnect();
                throw error;
            }
            this._gashouderExperienceFilter = filter;
            return filter;
        },

        startGashouderExperience() {
            if (this._gashouderExperience?.active) return false;
            const state = this._gashouderExperience = { active: true, pass: null, camera: null, timer: null, button: null };
            try {
                this._syncGashouderExperienceCamera(this.isInVRMode ? this.vrHelper?.baseExperience?.camera : this.camera);
                const filter = this._gashouderExperienceAudio();
                if (filter) filter.gain.setTargetAtTime(-1.5, this.audioContext.currentTime, 0.3);
                else this.showErrorMessage('Music processing is unavailable; the visual effect will run without audio changes.');
                state.endsAt = Date.now() + DURATION_MS;
                state.timer = setTimeout(() => this.stopGashouderExperience(), DURATION_MS);
                const button = document.createElement('button');
                button.type = 'button';
                button.textContent = 'Stop simulated effect';
                button.style.cssText = 'position:fixed;right:12px;bottom:12px;z-index:11000;padding:12px;background:#17242d;color:white;border:1px solid #9ed5d0;border-radius:8px';
                button.addEventListener('click', () => this.stopGashouderExperience());
                document.body.appendChild(button);
                state.button = button;
                const onVisibility = () => {
                    if (state.active && Date.now() >= state.endsAt) this.stopGashouderExperience();
                };
                state.onVisibility = onVisibility;
                document.addEventListener('visibilitychange', onVisibility);
                this._refreshVRQuickMenu?.();
                return true;
            } catch (error) {
                this.stopGashouderExperience();
                log.warn('Could not start the Gashouder personal effect:', error);
                this.showErrorMessage('The simulated effect could not start.');
                return false;
            }
        },

        stopGashouderExperience() {
            const state = this._gashouderExperience;
            if (!state?.active) return false;
            state.active = false;
            if (state.timer) clearTimeout(state.timer);
            if (state.onVisibility) document.removeEventListener('visibilitychange', state.onVisibility);
            if (state.pass) state.pass.dispose(state.camera);
            state.button?.remove();
            if (this._gashouderExperienceFilter && this.audioContext?.state !== 'closed') {
                this._gashouderExperienceFilter.gain.setTargetAtTime(0, this.audioContext.currentTime, 0.15);
            }
            this._refreshVRQuickMenu?.();
            return true;
        },

        disposeGashouderExperience() {
            this.stopGashouderExperience();
            const dialog = document.getElementById('gashouderEffectDialog');
            if (dialog?.open) dialog.close();
            const start = document.getElementById('gashouderEffectStart');
            const cancel = document.getElementById('gashouderEffectCancel');
            if (start) start.onclick = null;
            if (cancel) cancel.onclick = null;
            if (this._gashouderExperienceFilter) this._gashouderExperienceFilter.disconnect();
            this._gashouderExperienceFilter = null;
            this._gashouderExperienceTexture?.dispose();
            this._gashouderExperienceTexture = null;
        }
    };

    window.GashouderExperience = GashouderExperience;
})();
