'use strict';

const GuestExperience = {
    openPhoneCompanion(kind = 'music') {
        this._phoneKind = kind;
        this.toggleVRQuickMenu(true);
        this._showVRQuickMenuPage('phoneCompanion');
    },

    syncPhoneCompanion(page, open) {
        if (page === 'phoneCompanion' && open) return;
        this._phonePairing?.cancel();
        this._phonePairing = null;
        this._phonePairCode = null;
        this._phoneConfirm = null;
        this._phoneTransferGeneration = (this._phoneTransferGeneration || 0) + 1;
    },

    startPhoneCompanionPairing() {
        if (window.VRPayment?.phoneCompanionAvailable === false || !window.VRPayment?.startPhonePairing) {
            this.showErrorMessage('Verified-account phone transfer is unavailable on this development site.');
            return;
        }
        this._phonePairing?.cancel();
        this._phonePairCode = null;
        const handle = window.VRPayment.startPhonePairing({
            onCode: ({ code }) => { this._phonePairCode = code; this._refreshVRQuickMenu(); },
            onStatus: status => {
                if (status === 'pending') return;
                this._phonePairCode = null;
                this.showErrorMessage(status === 'approved' ? 'Device linked. You can now sync from your phone.' : 'Pairing code expired. Request a new code.');
                this._refreshVRQuickMenu();
            }
        });
        this._phonePairing = handle;
        handle.done.catch(error => {
            if (!this._disposed) this.showErrorMessage(`Phone pairing failed: ${error.message}`);
        }).finally(() => { if (this._phonePairing === handle) this._phonePairing = null; });
    },

    async transferPhoneCompanion(operation) {
        if (this._phoneTransferBusy) return;
        const generation = this._phoneTransferGeneration || 0;
        this._phoneTransferBusy = true;
        try {
            if (operation === 'music') {
                const result = await window.VRPayment.syncPhoneMusic(this.musicLibrary);
                if (!this._disposed) this.showErrorMessage(result.unchanged ? 'No music list is saved on your account yet.' : 'Saved music synced. Current playback is unchanged.');
                return;
            }
            const store = this._lightingPresetStore();
            const confirm = this._phoneConfirm?.operation === operation && performance.now() < this._phoneConfirm.until;
            this._phoneConfirm = null;
            if (confirm) {
                if (operation === 'import') store.confirmPhoneImport();
                else await store.confirmPhoneExport();
                if (!this._disposed) this.showErrorMessage(operation === 'import' ? 'Local lighting presets replaced from your account.' : "Account lighting backup replaced with this device's presets.");
            } else {
                const result = operation === 'import' ? await store.stagePhoneImport() : await store.preparePhoneExport();
                if (this._disposed || generation !== (this._phoneTransferGeneration || 0)) return;
                this._phoneConfirm = { operation, until: performance.now() + 4000 };
                this.showErrorMessage(operation === 'import'
                    ? `${result.count} presets ready. Press DOWNLOAD again within four seconds to REPLACE all twelve local slots.`
                    : 'Press UPLOAD again within four seconds to REPLACE your account lighting backup.');
            }
        } catch (error) {
            if (!this._disposed) this.showErrorMessage(`Phone transfer failed: ${error.message}`);
        } finally {
            this._phoneTransferBusy = false;
            if (!this._disposed && this._vrQuickMenuPage === 'phoneCompanion') this._refreshVRQuickMenu();
        }
    },

    setShowMood(program) {
        if (!this.guardHostControl('lights')) return false;
        if (!['nocturne', 'aesthetic'].includes(program) || !this.showDirector) return false;
        this.showDirector.setProgram(program);
        this.vjDirector?.setMasterIntensity(1);
        this.resumeAutoShow();
        return true;
    },

    blackOutShow() {
        if (!this.guardHostControl('lights')) return false;
        this.vjDirector.setMasterIntensity(0);
        this.masterIntensity = 0;
        this.showErrorMessage('Show blacked out. Choose an automatic mood to restore it.');
        return true;
    },

    getVoiceClarityMode() {
        if (this._voiceClarityMode) return this._voiceClarityMode;
        try {
            this._voiceClarityMode = localStorage.getItem('vrclub.voiceClarity') === 'nearby' ? 'nearby' : 'standard';
        } catch (error) {
            console.warn('Conversation audio preference could not be read:', error);
            this._voiceClarityMode = 'standard';
        }
        return this._voiceClarityMode;
    },

    toggleVoiceClarity() {
        const mode = this.getVoiceClarityMode() === 'nearby' ? 'standard' : 'nearby';
        this._voiceClarityMode = mode;
        try { localStorage.setItem('vrclub.voiceClarity', mode); }
        catch (error) {
            console.warn('Conversation audio preference could not be saved:', error);
            this.showErrorMessage('Conversation audio changed for this session only; storage is unavailable.');
        }
        this._renderVoiceClarityButton();
        this.multiplayer?._emit();
        return mode;
    },

    nearbyVoiceActivity() {
        const camera = this._playerCamera();
        if (!camera || !this.avatarManager?.remotes) return 0;
        const position = camera.globalPosition || camera.position;
        let activity = 0;
        for (const peer of this.avatarManager.remotes.values()) {
            if (!peer.hasState || peer.hidden || peer.culled || peer.muted || peer.simulated ||
                (!peer.speaking && !this.multiplayer?.micEnabled)) continue;
            const root = peer.root.position;
            const distance = Math.hypot(position.x - root.x, position.y - peer.eyeY, position.z - root.z);
            activity = Math.max(activity, Math.max(0, Math.min(1, (1.8 - distance) / 0.7)));
        }
        return activity;
    },

    _vrCreditsDefinitions(common) {
        if (!this._vrCreditsLines) {
            const content = document.querySelector('#modelCredits .credits-content') || document.getElementById('modelCredits');
            const text = content ? content.innerText || content.textContent : '';
            const links = content ? Array.from(content.querySelectorAll('a[href]'), link => `${link.textContent}: ${link.href}`) : [];
            this._vrCreditsLines = GuestExperience.wrapWords(`${text}\n${links.join('\n')}`, 45);
        }
        const lines = this._vrCreditsLines;
        const pages = Math.max(1, Math.ceil(lines.length / 16));
        this._vrCreditsPage = Math.max(0, Math.min(pages - 1, this._vrCreditsPage || 0));
        const shown = lines.slice(this._vrCreditsPage * 16, (this._vrCreditsPage + 1) * 16);
        const definitions = [];
        for (let i = 0; i < shown.length; i += 2) {
            definitions.push({ label: shown[i], detail: shown[i + 1] || '', action: 'creditText' });
        }
        while (definitions.length < 8) definitions.push(null);
        return [...definitions,
            { label: 'PREVIOUS', action: 'creditPage', delta: -1 },
            { label: `NEXT (${this._vrCreditsPage + 1}/${pages})`, action: 'creditPage', delta: 1 },
            common.back, common.close];
    },

    createGuestExperience() {
        this._guestTouchpoints = [];
        const B = BABYLON;
        const create = (name, x, y, z, yaw, title, action, detail) => {
            const texture = new B.DynamicTexture(`${name}Text`, { width: 768, height: 384 }, this.scene, false);
            const context = texture.getContext();
            context.fillStyle = '#10181d';
            context.fillRect(0, 0, 768, 384);
            context.fillStyle = '#b7eee2';
            context.font = 'bold 62px sans-serif';
            context.textAlign = 'center';
            context.fillText(title, 384, 120, 700);
            context.fillStyle = '#ffffff';
            context.font = '36px sans-serif';
            context.fillText(detail, 384, 215, 700);
            context.fillText('POINT AND SELECT', 384, 305, 700);
            texture.update();
            const mesh = B.MeshBuilder.CreatePlane(name, { width: 0.9, height: 0.45 }, this.scene);
            mesh.position.set(x, y, z);
            mesh.rotation.y = yaw;
            mesh.material = this.materialFactory.createStandardMaterial(`${name}Mat`, {
                diffuseTexture: texture, emissiveColor: [0.35, 0.35, 0.35], disableLighting: true
            });
            mesh.metadata = { vrclubGuestAction: action };
            this._guestTouchpoints.push({ mesh, texture });
            return mesh;
        };
        const vestibule = window.VenueLayout.vestibule;
        create('tonightBoard', -2.7, vestibule.streetLevel + 1.55, vestibule.farZ - 0.24, 0,
            'TONIGHT', 'rooms', 'ROOMS AND YOUR LIVE EVENT');
        const restroom = window.VenueLayout.restroom;
        const wardrobe = create('mirrorWardrobe', restroom.wallX - 0.3, 1.65,
            (restroom.sinkZ[0] + restroom.sinkZ[1]) / 2, Math.PI / 2,
            'WARDROBE', 'wardrobe', 'YOUR BODY AND OUTFIT');
        this._restroomMeshes?.push(wardrobe);
        this._guestTouchpointSubscription = this._multiplayer()?.onChange(() => this._drawTonightBoard());
        this._drawTonightBoard();
        this._createPostcardButton();
        const duck = document.getElementById('networkDuck');
        if (duck) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'vj-button network-wide';
            button.addEventListener('click', () => this.toggleVoiceClarity());
            duck.after(button);
            this._voiceClarityButton = button;
            this._renderVoiceClarityButton();
        }
    },

    _renderVoiceClarityButton() {
        const button = this._voiceClarityButton;
        if (!button) return;
        const nearby = this.getVoiceClarityMode() === 'nearby';
        button.textContent = nearby ? 'Conversation audio: nearby, gentle music dip' : 'Conversation audio: standard music dip';
        button.setAttribute('aria-pressed', String(nearby));
    },

    _drawTonightBoard() {
        const board = this._guestTouchpoints?.[0];
        if (!board) return;
        const mp = this.multiplayer;
        const rooms = mp?.directoryRooms?.().filter(room => !room.private).slice(0, 2) || [];
        const signature = `${!!mp?.hasLiveEvent}:${rooms.map(room => `${room.room}:${room.people}:${room.capacity}:${room.locked}`).join('|')}`;
        if (this._tonightSignature === signature) return;
        this._tonightSignature = signature;
        const context = board.texture.getContext();
        context.fillStyle = '#10181d';
        context.fillRect(0, 0, 768, 384);
        context.textAlign = 'center';
        context.fillStyle = '#b7eee2';
        context.font = 'bold 58px sans-serif';
        context.fillText('TONIGHT AT NOCTURNE', 384, 85, 700);
        context.fillStyle = '#ffffff';
        context.font = '34px sans-serif';
        context.fillText(mp?.hasLiveEvent ? 'LIVE EVENT IN THIS ROOM' : 'FIND A ROOM / MEET FRIENDS', 384, 160, 700);
        if (rooms.length) {
            rooms.forEach((room, index) => context.fillText(
                `${room.room.slice(0, 24)} / ${room.people} of ${room.capacity}${room.locked ? ' / LOCKED' : ''}`,
                384, 220 + index * 52, 700));
        } else context.fillText('SELECT TO BROWSE PUBLIC ROOMS', 384, 230, 700);
        context.font = '26px sans-serif';
        context.fillText('ADVISORY COUNTS / CHOOSE BEFORE CONNECTING', 384, 340, 700);
        board.texture.update();
    },

    _pressGuestTouchpoint(pick) {
        const action = pick?.pickedMesh?.metadata?.vrclubGuestAction;
        if (!action) return false;
        if (action === 'wardrobe') {
            if (this.isInVRMode) {
                this.toggleVRQuickMenu(true);
                const editor = this._getAvatarEditor();
                if (editor?.openVR({ mirror: true })) this._showVRQuickMenuPage('appearanceEditor');
            } else this._getAvatarEditor()?.open();
        } else if (action === 'rooms') {
            if (this.isInVRMode) {
                this.toggleVRQuickMenu(true);
                this._activateVRQuickMenuButton({ action: 'page', target: 'online' });
            } else document.getElementById('networkToggle')?.click();
        }
        return true;
    },

    _createPostcardButton() {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = 'Photo';
        button.setAttribute('aria-label', 'Take a local NOCTURNE postcard');
        button.className = 'postcard-toggle';
        button.addEventListener('click', () => void this.capturePostcard());
        document.getElementById('bottomControls')?.appendChild(button);
        this._postcardButton = button;
    },

    async capturePostcard() {
        if (this._postcardCapturing) return false;
        if (this._immersive?.needsAccess?.() && this._immersive.mode === 'locked') {
            this.showErrorMessage('Link your account before taking a club postcard.');
            return false;
        }
        this._postcardCapturing = true;
        const hidden = [];
        let camera;
        try {
            if (typeof BABYLON.Tools.CreateScreenshotUsingRenderTargetAsync !== 'function') {
                throw new Error('Photo capture is unavailable in this browser.');
            }
            const player = this._playerCamera();
            camera = new BABYLON.FreeCamera('postcardCamera', (player.globalPosition || player.position).clone(), this.scene);
            camera.rotationQuaternion = player.absoluteRotation?.clone() || player.rotationQuaternion?.clone() ||
                BABYLON.Quaternion.FromEulerAngles(player.rotation.x, player.rotation.y, player.rotation.z);
            camera.fov = player.fov;
            camera.minZ = player.minZ;
            camera.maxZ = player.maxZ;
            camera.layerMask = 0x0FFFFFFF;
            if (this._vrQuickMenuRoot?.isEnabled()) {
                hidden.push(this._vrQuickMenuRoot);
                this._vrQuickMenuRoot.setEnabled(false);
            }
            for (const peer of this.avatarManager?.remotes?.values() || []) {
                for (const mesh of [peer.nameplate, peer.chatPlane, peer.emojiPlane]) {
                    if (mesh?.isEnabled()) { hidden.push(mesh); mesh.setEnabled(false); }
                }
            }
            const image = await BABYLON.Tools.CreateScreenshotUsingRenderTargetAsync(
                this.engine, camera, { width: 1280, height: 720 }, 'image/png', 1, true);
            if (this._disposed) return false;
            const prefix = 'data:image/png;base64,';
            if (!image.startsWith(prefix)) throw new Error('Photo capture returned an unsupported image.');
            const pixels = Uint8Array.from(window.atob(image.slice(prefix.length)), char => char.charCodeAt(0));
            const bitmap = await window.createImageBitmap(new Blob([pixels], { type: 'image/png' }));
            try {
                const canvas = document.createElement('canvas');
                canvas.width = 1280; canvas.height = 800;
                const context = canvas.getContext('2d');
                context.drawImage(bitmap, 0, 0, 1280, 720);
                context.fillStyle = '#101418'; context.fillRect(0, 720, 1280, 80);
                context.fillStyle = '#b7eee2'; context.font = 'bold 28px sans-serif';
                context.fillText('NOCTURNE', 30, 770);
                context.fillStyle = '#ffffff'; context.font = '22px sans-serif';
                context.fillText(this.getPlaybackInfo()?.title || 'A night at NOCTURNE', 250, 770, 990);
                const blob = await new Promise((resolve, reject) => canvas.toBlob(
                    value => value ? resolve(value) : reject(new Error('The photo could not be encoded.')), 'image/png'));
                if (this._disposed) return false;
                if (this._postcardUrl) URL.revokeObjectURL(this._postcardUrl);
                this._postcardUrl = URL.createObjectURL(blob);
            } finally { bitmap.close(); }
            this.showErrorMessage('Photo ready. Save it locally from Camera. Names and chat are excluded; nothing was uploaded.');
            if (this.isInVRMode) this._showVRQuickMenuPage('camera');
            else this.savePostcard();
            return true;
        } catch (error) {
            console.warn('Postcard capture failed:', error);
            this.showErrorMessage(`Could not take photo: ${error.message}`);
            return false;
        } finally {
            camera?.dispose();
            for (const mesh of hidden) if (!mesh.isDisposed()) mesh.setEnabled(true);
            this._postcardCapturing = false;
        }
    },

    savePostcard() {
        if (!this._postcardUrl) { this.showErrorMessage('Take a photo first.'); return false; }
        const link = document.createElement('a');
        link.href = this._postcardUrl;
        link.download = 'nocturne-postcard.png';
        document.body.appendChild(link);
        link.click();
        link.remove();
        return true;
    },

    copyPostcardInvite() {
        if (!this.multiplayer?.connected) {
            this.showErrorMessage('Join a room before copying an invitation.');
            return;
        }
        if (!this._postcardInviteArmed || performance.now() > this._postcardInviteArmed) {
            this._postcardInviteArmed = performance.now() + 4000;
            this.showErrorMessage('Press COPY ROOM INVITE again to include a room invitation. Anyone you send it to may join an unlocked room.');
            return;
        }
        this._postcardInviteArmed = 0;
        if (!navigator.clipboard?.writeText) {
            this.showErrorMessage('Clipboard access is unavailable. Use the Online panel to share your room.');
            return;
        }
        navigator.clipboard.writeText(this.multiplayer.inviteUrl()).then(
            () => this.showErrorMessage('Room invite copied separately. The photo contains no private room code.'),
            error => this.showErrorMessage(`Could not copy invitation: ${error.message}`));
    },

    disposeGuestExperience() {
        this.syncPhoneCompanion(null, false);
        this._guestTouchpointSubscription?.();
        this._guestTouchpointSubscription = null;
        for (const entry of this._guestTouchpoints || []) {
            entry.mesh.dispose(false, true);
            entry.texture.dispose();
        }
        this._guestTouchpoints = null;
        this._postcardButton?.remove();
        this._voiceClarityButton?.remove();
        if (this._postcardUrl) URL.revokeObjectURL(this._postcardUrl);
        this._postcardUrl = null;
    }
};

GuestExperience.wrapWords = function (text, width) {
    const lines = [];
    for (const paragraph of text.split(/\n+/)) {
        let line = '';
        for (const word of paragraph.trim().split(/\s+/)) {
            if (!word) continue;
            if (line && line.length + word.length + 1 > width) { lines.push(line); line = ''; }
            for (let offset = 0; offset < word.length; offset += width) {
                const part = word.slice(offset, offset + width);
                if (offset) { if (line) lines.push(line); line = ''; }
                line += (line ? ' ' : '') + part;
            }
        }
        if (line) lines.push(line);
    }
    return lines;
};
window.GuestExperience = GuestExperience;
