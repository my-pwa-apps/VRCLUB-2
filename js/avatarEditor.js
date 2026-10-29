'use strict';

class AvatarEditor {
    static nextId = 1;

    constructor(club) {
        this.club = club;
        this.id = AvatarEditor.nextId++;
        this.dialog = null;
        this.engine = null;
        this.scene = null;
        this.preview = null;
        this.previewBase = null;
        this.draft = null;
        this.loadGeneration = 0;
        this.vrPreview = null;
        this.vrPreviewBase = null;
        this.vrAnchor = null;
        this.vrDraft = null;
        this.vrPage = 'appearanceEditor';
        this.vrBasePage = 0;
        this.vrColorPage = {};
        this.vrVisible = false;
        this.disposed = false;
    }

    _setVRPreviewLight(meshes) {
        const lights = this.club?.lightFactory;
        if (!lights || !meshes.length) return;
        const name = `personalWardrobePreviewKey${this.id}`;
        if (this.vrPreviewLight) {
            lights.disposeLight(name);
            this.vrPreviewLight = null;
        }
        try {
            const light = lights.createPointLight(name, new BABYLON.Vector3(-0.15, 1.25, -0.18), {
                intensity: 2.4,
                range: 4.5,
                diffuse: [1, 0.9, 0.79],
                specular: [0.2, 0.2, 0.2],
                includedMeshes: meshes
            });
            light.renderPriority = 1;
            light.parent = this.vrAnchor;
            meshes.forEach(mesh => mesh._resyncLightSources?.());
            this.vrPreviewLight = light;
        } catch (error) {
            this.club.showErrorMessage?.(`Wardrobe lighting is unavailable: ${error.message || 'unknown error'}`);
        }
    }

    static get BASES() {
        return [
            ...Array.from({ length: 8 }, (_, index) => `f${index + 1}`),
            ...Array.from({ length: 9 }, (_, index) => `m${index + 1}`)
        ];
    }

    static get HAIR() { return ['original', 'short', 'long', 'bald']; }
    static get OUTFITS() { return ['original', 'casual', 'smart']; }
    static get FOOTWEAR() {
        return {
            shoes: { original: 'Original shoes', loafers: 'Loafers', pumps: 'Pumps', heels: 'Heeled ankle boots' },
            legwear: { bare: 'Bare legs', 'sheer-black': 'Sheer black tights', 'sheer-nude': 'Sheer nude tights' }
        };
    }
    static get ACCESSORIES() {
        return {
            glasses: ['none', 'round', 'square', 'heart', 'star', 'sunglasses'],
            facialHair: ['none', 'stubble', 'beard'],
            hat: ['none', 'cap', 'beanie', 'fedora', 'bucket']
        };
    }
    static get COLORS() {
        return [
            { name: 'Deep umber', value: '#513327' },
            { name: 'Warm brown', value: '#80543f' },
            { name: 'Tan', value: '#b77a58' },
            { name: 'Warm beige', value: '#d59b75' },
            { name: 'Light peach', value: '#efc5a4' },
            { name: 'Pale peach', value: '#f5d7bd' },
            { name: 'Black', value: '#161820' },
            { name: 'Charcoal', value: '#414650' },
            { name: 'Silver', value: '#9aa3ad' },
            { name: 'White', value: '#e8e8e3' },
            { name: 'Red', value: '#c5465b' },
            { name: 'Orange', value: '#e28b48' },
            { name: 'Yellow', value: '#ddc457' },
            { name: 'Green', value: '#4e9c76' },
            { name: 'Blue', value: '#4d7ec2' },
            { name: 'Violet', value: '#8a68b5' },
            { name: 'Rose', value: '#d876a0' },
            { name: 'Teal', value: '#48a7a5' },
            { name: 'Brown', value: '#79533d' },
            { name: 'Navy', value: '#273b63' }
        ];
    }

    _cloneDraft(value) {
        return JSON.parse(JSON.stringify(value));
    }

    _appearanceApi() {
        return window.AvatarAppearance && typeof window.AvatarAppearance.loadPreview === 'function'
            ? window.AvatarAppearance : null;
    }

    _freshDraft() {
        const draft = this.club.getAppearanceDraft();
        if (!draft || ![1, 2, 3].includes(draft.v)) throw new Error('Your personal appearance is not available.');
        return this._cloneDraft({ glasses: 'none', facialHair: 'none', hat: 'none',
            shoes: 'original', legwear: 'bare', ...draft, v: 3 });
    }

    _setError(target, message) {
        if (!target) return;
        if (target === this._vrError && message) this.club?.showErrorMessage?.(message);
        target.textContent = message || '';
        target.hidden = !message;
    }

    _disposeDesktopPreview() {
        this.loadGeneration++;
        if (this.engine) {
            try { this.engine.stopRenderLoop(this._renderFrame); } catch (_) { /* already stopped */ }
        }
        if (this._camera) {
            try { this._camera.detachControl(); } catch (_) { /* scene may already be disposed */ }
            this._camera = null;
        }
        if (this.preview) {
            try { this.preview.dispose(); } catch (_) { /* loader owns its model resources */ }
            this.preview = null;
        }
        this.previewBase = null;
        if (this.previewLightFactory) {
            try { this.previewLightFactory.dispose(); } catch (_) { /* preview scene is already disposed */ }
            this.previewLightFactory = null;
        }
        if (this.scene) {
            try { this.scene.dispose(); } catch (_) { /* canvas may already be gone */ }
            this.scene = null;
        }
        if (this.engine) {
            try { this.engine.dispose(); } catch (_) { /* browser may have lost the context */ }
            this.engine = null;
        }
        this._renderFrame = null;
    }

    open() {
        if (this.disposed || !this.club || !this.club.getAppearanceDraft) return false;
        if (this.dialog) {
            this.dialog.querySelector('[data-avatar-close]')?.focus();
            return true;
        }
        try {
            this.draft = this._freshDraft();
        } catch (error) {
            this.club.showErrorMessage?.(error.message);
            return false;
        }

        const ui = this._buildDialog();
        const { dialog } = ui;
        this._restoreFocus = document.activeElement;
        this.dialog = dialog;
        document.body.appendChild(dialog);
        this._canvas = ui.canvas;
        this._status = ui.status;
        this._error = ui.error;
        this._form = ui.form;
        this._syncForm();
        this._wireDesktop(dialog);
        ui.close.focus();
        this._createDesktopPreview();
        return true;
    }

    _buildDialog() {
        const element = (tag, className, text) => {
            const node = document.createElement(tag);
            if (className) node.className = className;
            if (text !== undefined) node.textContent = text;
            return node;
        };
        const button = (text, { className = '', action = '', label = '', rotate = null } = {}) => {
            const node = element('button', className, text);
            node.type = 'button';
            if (action) node.dataset.action = action;
            if (rotate !== null) node.dataset.rotate = String(rotate);
            if (label) node.setAttribute('aria-label', label);
            return node;
        };
        const field = (labelText, input, id) => {
            const label = element('label', '', labelText);
            input.id = id;
            label.htmlFor = id;
            label.append(input);
            return label;
        };

        const dialog = element('section', 'avatar-editor');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'avatarEditorTitle');
        dialog.tabIndex = -1;
        const panel = element('div', 'avatar-editor__panel');
        const header = element('header', 'avatar-editor__header');
        const title = element('h2', '', 'Personal wardrobe');
        title.id = 'avatarEditorTitle';
        const close = button('Close', { label: 'Close wardrobe' });
        close.dataset.avatarClose = '';
        header.append(title, close);

        const privacy = element('p', 'avatar-editor__privacy',
            'Customize your own detailed avatar. This does not upload a photo or use an account or remote avatar service.');
        const notice = element('p', 'avatar-editor__notice',
            'Personal customizations use the detailed model, even when lightweight characters are enabled.');

        const layout = element('div', 'avatar-editor__layout');
        const previewWrap = element('div', 'avatar-editor__preview-wrap');
        const canvas = element('canvas', 'avatar-editor__canvas');
        canvas.setAttribute('aria-label', 'Rotating 3D preview of your personal avatar');
        const rotate = element('div', 'avatar-editor__rotate');
        rotate.append(
            button('Rotate left', { label: 'Rotate avatar left', rotate: -1 }),
            button('Rotate right', { label: 'Rotate avatar right', rotate: 1 })
        );
        previewWrap.append(canvas, rotate, element('p', 'avatar-editor__hint', 'Drag the preview to rotate.'));

        const form = element('form', 'avatar-editor__form');
        form.setAttribute('aria-label', 'Wardrobe options');
        const base = element('select');
        base.name = 'base';
        for (const id of AvatarEditor.BASES) {
            const option = element('option', '', window.WardrobeCatalog?.[id]?.label || id.toUpperCase());
            option.value = id;
            base.append(option);
        }
        const hair = element('select');
        hair.name = 'hair';
        for (const value of AvatarEditor.HAIR) {
            const option = element('option', '', `${value[0].toUpperCase()}${value.slice(1)}`);
            option.value = value;
            hair.append(option);
        }
        const outfit = element('select');
        outfit.name = 'outfit';
        for (const value of AvatarEditor.OUTFITS) {
            const option = element('option', '', `${value[0].toUpperCase()}${value.slice(1)}`);
            option.value = value;
            outfit.append(option);
        }
        form.append(
            field('Base character', base, 'avatarBase'),
            field('Hair style', hair, 'avatarHair'),
            field('Outfit', outfit, 'avatarOutfit')
        );
        for (const [key, label] of [['glasses', 'Glasses'], ['facialHair', 'Facial hair'], ['hat', 'Headwear']]) {
            const select = element('select');
            select.name = key;
            for (const value of AvatarEditor.ACCESSORIES[key]) {
                const option = element('option', '', `${value[0].toUpperCase()}${value.slice(1)}`);
                option.value = value;
                select.append(option);
            }
            form.append(field(label, select, `avatar-${key}`));
        }
        for (const [key, label] of [['shoes', 'Shoes'], ['legwear', 'Legwear']]) {
            const select = element('select');
            select.name = key;
            for (const [value, text] of Object.entries(AvatarEditor.FOOTWEAR[key])) {
                const option = element('option', '', text);
                option.value = value;
                select.append(option);
            }
            form.append(field(label, select, `avatar-${key}`));
        }
        form.append(element('p', 'avatar-editor__notice', 'Casual outfits include graphic prints. Headwear covers the hair to keep it from clipping. Facial hair follows Hair color.'));
        for (const [key, label] of [
            ['skin', 'Skin color'],
            ['hairColor', 'Hair color'],
            ['top', 'Top color'],
            ['bottom', 'Bottom color']
        ]) {
            const input = element('input');
            input.type = 'color';
            input.name = key;
            input.setAttribute('aria-label', label);
            form.append(field(label, input, `avatarColor-${key}`));
        }
        layout.append(previewWrap, form);

        const status = element('p', 'avatar-editor__status');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.hidden = true;
        const error = element('p', 'avatar-editor__error');
        error.setAttribute('role', 'alert');
        error.hidden = true;

        const actions = element('footer', 'avatar-editor__actions');
        const uploadGlbBtn = button(
            this.club?.getCustomAvatarName?.()
                ? `Custom .GLB: ${this.club.getCustomAvatarName()}`
                : 'Upload .GLB avatar',
            { action: 'upload-glb' }
        );
        actions.append(
            button('Reset personal appearance', { action: 'reset' }),
            uploadGlbBtn,
            element('span'),
            button('Cancel', { action: 'cancel' }),
            button('Save appearance', { className: 'is-primary', action: 'save' })
        );
        panel.append(header, privacy, notice, layout, status, error, actions);
        dialog.append(panel);
        return { dialog, close, canvas, status, error, form };
    }

    _syncForm() {
        if (!this._form || !this.draft) return;
        for (const key of ['base', 'hair', 'outfit', 'glasses', 'facialHair', 'hat', 'shoes', 'legwear']) this._form.elements[key].value = this.draft[key];
        for (const key of ['skin', 'hairColor', 'top', 'bottom']) {
            const input = this._form.elements[key];
            input.value = /^#[0-9a-f]{6}$/i.test(this.draft[key]) ? this.draft[key] : '#808080';
        }
    }

    _wireDesktop(dialog) {
        this._onDialogKey = event => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.close();
                return;
            }
            if (event.key !== 'Tab') return;
            const controls = [...dialog.querySelectorAll('button:not(:disabled), select:not(:disabled), input:not(:disabled)')];
            if (!controls.length) return;
            const first = controls[0], last = controls[controls.length - 1];
            if (!dialog.contains(document.activeElement)) {
                event.preventDefault(); first.focus();
            } else if (event.shiftKey && document.activeElement === first) {
                event.preventDefault(); last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault(); first.focus();
            }
        };
        dialog.addEventListener('keydown', this._onDialogKey);
        this._onInput = event => {
            const key = event.target.name;
            if (!key || !['base', 'hair', 'outfit', 'skin', 'hairColor', 'top', 'bottom', 'glasses', 'facialHair', 'hat', 'shoes', 'legwear'].includes(key)) return;
            const baseChanged = key === 'base' && this.draft.base !== event.target.value;
            this.draft[key] = event.target.value;
            this._clearError();
            if (baseChanged && this.scene) {
                this._setError(this._status, 'Loading selected character…');
                this._loadPreview(this.scene, this.draft, false);
            } else this._updatePreview();
        };
        this._form.addEventListener('input', this._onInput);
        this._form.addEventListener('change', this._onInput);
        dialog.querySelector('[data-avatar-close]').addEventListener('click', () => this.close());
        dialog.querySelectorAll('[data-rotate]').forEach(button => {
            button.addEventListener('click', () => this._rotateDesktop(Number(button.dataset.rotate) * Math.PI / 6));
        });
        dialog.querySelector('[data-action="cancel"]').addEventListener('click', () => this.close());
        dialog.querySelector('[data-action="save"]').addEventListener('click', () => void this._saveDesktop());
        dialog.querySelector('[data-action="reset"]').addEventListener('click', () => void this._resetDesktop());
        dialog.querySelector('[data-action="upload-glb"]')?.addEventListener('click', () => {
            const globalInput = document.getElementById('customAvatarGlbInput');
            if (globalInput) {
                globalInput.click();
                this.close();
            }
        });
        this._onPointerDown = event => {
            this._dragX = event.clientX;
            this._canvas.setPointerCapture?.(event.pointerId);
        };
        this._onPointerMove = event => {
            if (this._dragX === null || this._dragX === undefined) return;
            const delta = event.clientX - this._dragX;
            this._dragX = event.clientX;
            this._rotateDesktop(delta * 0.009);
        };
        this._onPointerEnd = () => { this._dragX = null; };
        this._canvas.addEventListener('pointerdown', this._onPointerDown);
        this._canvas.addEventListener('pointermove', this._onPointerMove);
        this._canvas.addEventListener('pointerup', this._onPointerEnd);
        this._canvas.addEventListener('pointercancel', this._onPointerEnd);
    }

    _createDesktopPreview() {
        const api = this._appearanceApi();
        if (!api || typeof BABYLON === 'undefined') {
            this._setError(this._error, '3D preview is unavailable. You can still save a valid appearance.');
            return;
        }
        this._setError(this._status, 'Loading avatar preview…');
        try {
            this.engine = new BABYLON.Engine(this._canvas, true, { preserveDrawingBuffer: false, stencil: false });
            this.scene = new BABYLON.Scene(this.engine);
            this.scene.clearColor = new BABYLON.Color4(0.035, 0.045, 0.065, 1);
            const camera = new BABYLON.ArcRotateCamera('avatarEditorCamera', -Math.PI / 2, 1.38, 2.65,
                new BABYLON.Vector3(0, 0.95, 0), this.scene);
            camera.attachControl(this._canvas, true);
            camera.lowerRadiusLimit = 2.2;
            camera.upperRadiusLimit = 5.5;
            camera.wheelPrecision = 60;
            this._camera = camera;
            if (typeof LightFactory !== 'function') throw new Error('The preview light factory is unavailable.');
            this.previewLightFactory = new LightFactory(this.scene, null, this.club.maxLights);
            this.previewLightFactory.createHemisphericLight('wardrobePreviewAmbient', BABYLON.Vector3.Up(), {
                intensity: 0.95, diffuse: [1, 1, 1], specular: [0.08, 0.08, 0.08], groundColor: [0.35, 0.32, 0.3]
            });
            this.previewLightFactory.createDirectionalLight('wardrobePreviewKey',
                new BABYLON.Vector3(-0.5, -1, 0.4), {
                    intensity: 1.4, diffuse: [1, 0.91, 0.8], specular: [0.15, 0.15, 0.15]
                });
            const frame = () => {
                if (this.scene) this.scene.render();
            };
            this._renderFrame = frame;
            this.engine.runRenderLoop(frame);
            this._onDesktopResize = () => this.engine?.resize();
            window.addEventListener('resize', this._onDesktopResize);
            void this._loadPreview(this.scene, this.draft, false);
        } catch (error) {
            this._setError(this._error, `Could not start the 3D preview: ${error.message || 'unknown error'}`);
        }
    }

    async _loadPreview(scene, appearance, isVR) {
        const api = this._appearanceApi();
        const generation = ++this.loadGeneration;
        if (isVR && this.vrPreviewBase !== appearance.base) this.vrPreviewBase = null;
        if (!isVR && this.previewBase !== appearance.base) this.previewBase = null;
        try {
            const loaded = await api.loadPreview(scene, this._cloneDraft(appearance),
                `personal-wardrobe-${this.id}-${generation}`);
            if (isVR) this.club?._restoreLightBudgets?.();
            if (this.disposed || generation !== this.loadGeneration ||
                (isVR ? !this.vrVisible : !this.dialog)) {
                loaded?.dispose?.();
                return;
            }
            loaded.update(this._cloneDraft(isVR ? this.vrDraft : this.draft));
            const old = isVR ? this.vrPreview : this.preview;
            if (old) old.dispose();
            if (isVR) {
                this.vrPreview = loaded;
                this.vrPreviewBase = appearance.base;
                loaded.root.parent = this.vrAnchor;
                loaded.root.position.set(0, 0, 0);
                loaded.root.scaling.setAll?.(0.78);
                if (loaded.root.scaling && !loaded.root.scaling.setAll) loaded.root.scaling.set(0.78, 0.78, 0.78);
                const layer = window.VRClubUI?.MENU_LAYER_MASK || 0x1FFFFFFF;
                loaded.root.layerMask = layer;
                const meshes = loaded.root.getChildMeshes?.() || [];
                meshes.forEach(mesh => { mesh.layerMask = layer; mesh.isPickable = false; mesh._resyncLightSources?.(); });
                loaded.root.setEnabled?.(true);
                this._setVRPreviewLight(meshes);
            } else {
                this.preview = loaded;
                this.previewBase = appearance.base;
            }
            this._setError(isVR ? this._vrError : this._error, '');
            this._setError(isVR ? this._vrStatus : this._status, '');
            if (isVR) this.club.showErrorMessage?.('Personal avatar preview ready.');
        } catch (error) {
            if (this.disposed || generation !== this.loadGeneration) return;
            this._setError(isVR ? this._vrStatus : this._status, '');
            this._setError(isVR ? this._vrError : this._error,
                `Could not load avatar preview: ${error.message || 'unknown error'}`);
        }
    }

    _updatePreview(isVR = false) {
        const loaded = isVR ? this.vrPreview : this.preview;
        if (!loaded) return;
        try {
            const result = loaded.update(this._cloneDraft(isVR ? this.vrDraft : this.draft));
            if (result && typeof result.catch === 'function') {
                result.catch(error => this._setError(isVR ? this._vrError : this._error,
                    `Could not update preview: ${error.message || 'unknown error'}`));
            }
        } catch (error) {
            this._setError(isVR ? this._vrError : this._error,
                `Could not update preview: ${error.message || 'unknown error'}`);
        }
    }

    _rotateDesktop(amount) {
        if (this._camera) this._camera.alpha += amount;
    }

    _clearError() {
        this._setError(this._error, '');
        this._setError(this._vrError, '');
    }

    _saveDesktop() { return this._commitDesktop(false); }

    _resetDesktop() { return this._commitDesktop(true); }

    async _commitDesktop(reset) {
        if (!this.dialog || this._saving) return;
        this._saving = true;
        this.dialog.querySelectorAll('button, select, input').forEach(control => { control.disabled = true; });
        this._setError(this._error, '');
        this._setError(this._status, reset ? 'Resetting personal appearance…' : 'Saving personal appearance…');
        try {
            const saved = reset ? await this.club.resetPersonalAppearance() :
                await this.club.savePersonalAppearance(this._cloneDraft(this.draft));
            this._saving = false;
            if (saved) this.close();
            else this._setError(this._error, this.club._personalAppearanceError || 'Your appearance could not be saved. Please try again.');
        } catch (error) {
            this._setError(this._error, `Could not save appearance: ${error.message || 'unknown error'}`);
        } finally {
            this._saving = false;
            this._setError(this._status, '');
            this.dialog?.querySelectorAll('button, select, input').forEach(control => { control.disabled = false; });
        }
    }

    close(force = false) {
        if (!this.dialog || this._saving && !force) return;
        const dialog = this.dialog;
        this.dialog = null;
        if (this._onDesktopResize) window.removeEventListener('resize', this._onDesktopResize);
        this._onDesktopResize = null;
        this._disposeDesktopPreview();
        dialog.remove();
        if (this._restoreFocus?.isConnected) this._restoreFocus.focus();
        this._restoreFocus = null;
        this.draft = null;
        this._canvas = this._form = this._status = this._error = null;
        this._onDialogKey = this._onInput = null;
        this._onPointerDown = this._onPointerMove = this._onPointerEnd = null;
    }

    _ensureVR() {
        if (this.vrAnchor) return true;
        if (!this.club.scene || !this._appearanceApi()) {
            this.club.showErrorMessage?.('The personal avatar preview is not ready yet.');
            return false;
        }
        try {
            this.vrAnchor = new BABYLON.TransformNode('personalWardrobePreviewAnchor', this.club.scene);
            this.vrAnchor.position.set(1.04, -0.13, -0.035);
            return true;
        } catch (error) {
            this.club.showErrorMessage?.(`Could not open wardrobe preview: ${error.message || 'unknown error'}`);
            return false;
        }
    }

    openVR() {
        if (this._saving) {
            this.club.showErrorMessage?.('Wait for your wardrobe to finish saving.');
            return false;
        }
        this.close(true);
        if (!this._ensureVR()) return false;
        if (this.vrVisible) return true;
        try {
            this.vrDraft = this._freshDraft();
        } catch (error) {
            this.club.showErrorMessage?.(error.message);
            return false;
        }
        this.vrVisible = true;
        this.vrBasePage = Math.floor(AvatarEditor.BASES.indexOf(this.vrDraft.base) / 6);
        this.vrColorPage = {};
        this.vrAnchor.parent = this.club._vrQuickMenuRoot;
        this.vrAnchor.setEnabled(true);
        this._vrStatus = { textContent: '', hidden: true };
        this._vrError = { textContent: '', hidden: true };
        this.club.showErrorMessage?.('Loading your personal avatar preview…');
        this._loadPreview(this.club.scene, this.vrDraft, true);
        return true;
    }

    syncVR(page, menuRoot, menuOpen = true) {
        const wardrobePage = /^appearance/.test(page || '');
        if (!wardrobePage || !menuOpen) {
            this.closeVR();
            return;
        }
        if (!this.vrVisible && !this.openVR()) return;
        this.vrPage = page;
        if (menuRoot && this.vrAnchor) this.vrAnchor.parent = menuRoot;
        if (this.vrPreview?.root) this.vrPreview.root.setEnabled?.(true);
    }

    closeVR() {
        this.vrVisible = false;
        this.loadGeneration++;
        if (this.vrPreview) {
            try { this.vrPreview.dispose(); } catch (_) { /* loader owns its model resources */ }
            this.vrPreview = null;
        }
        this.vrPreviewBase = null;
        if (this.vrPreviewLight && this.club?.lightFactory) {
            try { this.club.lightFactory.disposeLight(`personalWardrobePreviewKey${this.id}`); } catch (_) { /* scene teardown */ }
            this.vrPreviewLight = null;
        }
        if (this.vrAnchor) {
            try { this.vrAnchor.dispose(false, false); } catch (_) { /* scene teardown may be underway */ }
            this.vrAnchor = null;
        }
        this.vrDraft = null;
        this._vrStatus = this._vrError = null;
    }

    _vrCommon() {
        return {
            back: { label: 'BACK TO WARDROBE', action: 'back', target: 'appearanceEditor' },
            close: { label: 'CANCEL EDIT', action: 'appearanceCancel' }
        };
    }

    getVRDefinitions(page) {
        const draft = this.vrDraft || {};
        const common = this._vrCommon();
        const selected = (key, value) => String(draft[key]).toLowerCase() === String(value).toLowerCase();
        if (page === 'appearanceEditor') {
            return [
                { label: `BASE ${(window.WardrobeCatalog?.[draft.base]?.label || draft.base || '').toUpperCase()}`, action: 'page', target: 'appearanceBase' },
                { label: `HAIR ${String(draft.hair || '').toUpperCase()}`, action: 'page', target: 'appearanceHair' },
                { label: `OUTFIT ${String(draft.outfit || '').toUpperCase()}`, action: 'page', target: 'appearanceOutfit' },
                { label: 'SKIN COLOR', action: 'page', target: 'appearanceSkin' },
                { label: 'HAIR COLOR', action: 'page', target: 'appearanceHairColor' },
                { label: 'TOP COLOR', action: 'page', target: 'appearanceTop' },
                { label: 'BOTTOM COLOR', action: 'page', target: 'appearanceBottom' },
                { label: 'ACCESSORIES', action: 'page', target: 'appearanceAccessories' },
                { label: 'ROTATE RIGHT', action: 'appearanceRotate', delta: 1 },
                { label: 'SAVE APPEARANCE', action: 'appearanceSave' },
                { label: 'RESET PERSONAL LOOK', action: 'appearanceReset' },
                common.close
            ];
        }
        if (page === 'appearanceAccessories') {
            return [
                { label: `GLASSES ${draft.glasses.toUpperCase()}`, action: 'page', target: 'appearanceGlasses' },
                { label: `FACIAL HAIR ${draft.facialHair.toUpperCase()}`, action: 'page', target: 'appearanceFacialHair' },
                { label: `HEADWEAR ${draft.hat.toUpperCase()}`, action: 'page', target: 'appearanceHat' },
                { label: 'SHOES AND TIGHTS', action: 'page', target: 'appearanceFootwear' },
                { label: 'ROTATE LEFT', action: 'appearanceRotate', delta: -1 },
                { label: 'ROTATE RIGHT', action: 'appearanceRotate', delta: 1 },
                common.back, common.close
            ];
        }
        if (page === 'appearanceFootwear') {
            return [
                { label: AvatarEditor.FOOTWEAR.shoes[draft.shoes].toUpperCase(), action: 'page', target: 'appearanceShoes' },
                { label: AvatarEditor.FOOTWEAR.legwear[draft.legwear].toUpperCase(), action: 'page', target: 'appearanceLegwear' },
                { label: 'ROTATE LEFT', action: 'appearanceRotate', delta: -1 },
                { label: 'ROTATE RIGHT', action: 'appearanceRotate', delta: 1 },
                { label: 'BACK TO ACCESSORIES', action: 'back', target: 'appearanceAccessories' }, common.close
            ];
        }
        if (page === 'appearanceShoes' || page === 'appearanceLegwear') {
            const field = page === 'appearanceShoes' ? 'shoes' : 'legwear';
            return [
                ...Object.entries(AvatarEditor.FOOTWEAR[field]).map(([value, label]) => ({
                    label: `${label.toUpperCase()}${selected(field, value) ? ' SELECTED' : ''}`,
                    action: 'appearanceSet', field, value
                })),
                { label: 'BACK TO SHOES AND TIGHTS', action: 'back', target: 'appearanceFootwear' }, common.close
            ];
        }
        if (page === 'appearanceBase') {
            const ids = AvatarEditor.BASES;
            const start = this.vrBasePage * 6;
            return [
                ...ids.slice(start, start + 6).map(id => ({
                    label: `${(window.WardrobeCatalog?.[id]?.label || id).toUpperCase()}${selected('base', id) ? ' SELECTED' : ''}`,
                    action: 'appearanceSet', field: 'base', value: id
                })),
                ...(this.vrBasePage > 0 ? [{ label: 'PREVIOUS BASES', action: 'appearanceBasePage', delta: -1 }] : []),
                ...(start + 6 < ids.length ? [{ label: 'MORE BASES', action: 'appearanceBasePage', delta: 1 }] : []),
                common.back, common.close
            ];
        }
        const stylePages = {
            appearanceHair: ['hair', AvatarEditor.HAIR, 'HAIR'],
            appearanceOutfit: ['outfit', AvatarEditor.OUTFITS, 'OUTFIT'],
            appearanceGlasses: ['glasses', AvatarEditor.ACCESSORIES.glasses, 'GLASSES'],
            appearanceFacialHair: ['facialHair', AvatarEditor.ACCESSORIES.facialHair, 'FACIAL HAIR'],
            appearanceHat: ['hat', AvatarEditor.ACCESSORIES.hat, 'HEADWEAR']
        };
        if (stylePages[page]) {
            const [field, values, label] = stylePages[page];
            const prefix = field === 'hair' || field === 'outfit' ? `${label} ` : '';
            return [
                ...values.map(value => ({ label: `${prefix}${value.toUpperCase()}${selected(field, value) ? ' SELECTED' : ''}`,
                    action: 'appearanceSet', field, value })),
                common.back, common.close
            ];
        }
        const colorPages = {
            appearanceSkin: 'skin', appearanceHairColor: 'hairColor',
            appearanceTop: 'top', appearanceBottom: 'bottom'
        };
        const field = colorPages[page];
        if (field) {
            const start = (this.vrColorPage[field] || 0) * 8;
            const swatches = AvatarEditor.COLORS.slice(start, start + 8);
            return [
                ...swatches.map(color => ({ label: `${color.name.toUpperCase()}${selected(field, color.value) ? ' SELECTED' : ''}`,
                    action: 'appearanceSet', field, value: color.value, swatch: color.value })),
                ...(start > 0 ? [{ label: 'PREVIOUS COLORS', action: 'appearanceColorPage', field, delta: -1 }] : []),
                ...(start + 8 < AvatarEditor.COLORS.length ? [{ label: 'MORE COLORS', action: 'appearanceColorPage', field, delta: 1 }] : []),
                common.back, common.close
            ];
        }
        return [common.close];
    }

    setDraftValue(field, value) {
        if (!this.vrDraft || !['base', 'hair', 'outfit', 'skin', 'hairColor', 'top', 'bottom', 'glasses', 'facialHair', 'hat', 'shoes', 'legwear'].includes(field)) return;
        const baseChanged = field === 'base' && this.vrDraft.base !== value;
        this.vrDraft[field] = value;
        this._clearError();
        if (baseChanged && this.club?.scene) {
            this.club.showErrorMessage?.('Loading selected character…');
            this._loadPreview(this.club.scene, this.vrDraft, true);
        } else this._updatePreview(true);
    }

    async saveVR() {
        if (!this.vrDraft) return false;
        try {
            if (!await this.club.savePersonalAppearance(this._cloneDraft(this.vrDraft))) return false;
            this.closeVR();
            return true;
        } catch (error) {
            this.club.showErrorMessage?.(`Could not save appearance: ${error.message || 'unknown error'}`);
            return false;
        }
    }

    async resetVR() {
        try {
            if (!await this.club.resetPersonalAppearance()) return false;
            this.closeVR();
            return true;
        } catch (error) {
            this.club.showErrorMessage?.(`Could not reset appearance: ${error.message || 'unknown error'}`);
            return false;
        }
    }

    async cancelVR() {
        this.closeVR();
        return true;
    }

    rotateVR(delta) {
        if (this.vrPreview?.root) this.vrPreview.root.rotation.y += delta * Math.PI / 8;
    }

    dispose() {
        if (this.disposed) return;
        this.close(true);
        this.closeVR();
        this.disposed = true;
        this.club = null;
    }
}

window.AvatarEditor = AvatarEditor;
