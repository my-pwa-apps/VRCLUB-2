'use strict';

class LiveEventConcept {
    static requested(search = window.location.search) {
        return document.documentElement?.dataset.liveEvent === 'ade' ||
            new URLSearchParams(search).get('liveEvent') === 'demo';
    }

    constructor(club) {
        this.club = club;
        this._meshes = [];
        this._materials = [];
        this._textures = [];
        this._listeners = [];
        this._disposed = false;
    }

    async mount() {
        this.panel = document.getElementById('liveEventConceptPanel');
        this.toggle = document.getElementById('liveEventConceptToggle');
        this.status = document.getElementById('liveEventConceptStatus');
        this.status.textContent = 'Independent ADE pitch environment, online and offline. The resident DJ is fictional; no live venue feed is connected.';
        await this._loadBrandArtwork();
        if (this._disposed) {
            this._brandLogo = null;
            return;
        }
        this._createDressing();
        document.getElementById('liveEventConceptLogo').src = 'concept-assets/ade/ade26-30y-black.png';
        this._listen(this.toggle, 'click', () => this.setPanelOpen(this.panel.hidden));
        const closePanel = () => {
            this.setPanelOpen(false);
            this.toggle.focus();
        };
        this._listen(document.getElementById('liveEventConceptClose'), 'click', closePanel);
        this._listen(document, 'keydown', event => {
            if (event.key === 'Escape' && !event.defaultPrevented && !this.panel.hidden) {
                event.preventDefault();
                closePanel();
            }
        });
        this._timer = setInterval(() => this._syncAvailability(), 500);
        this.toggle.hidden = false;
        this.setPanelOpen(true);
        this._syncAvailability();
    }

    setPanelOpen(open) {
        this.panel.hidden = !open;
        this.toggle.setAttribute('aria-expanded', String(open));
    }

    _listen(element, type, listener) {
        element.addEventListener(type, listener);
        this._listeners.push([element, type, listener]);
    }

    _createDressing() {
        this.root = new BABYLON.TransformNode('liveEventConceptRoot', this.club.scene);
        const table = this.club.scene.getMeshByName('djTable');
        if (!table) throw new Error('The ADE fascia requires the DJ table to be built first.');
        table.computeWorldMatrix(true);
        const bounds = table.getBoundingInfo().boundingBox;
        const fasciaWidth = bounds.maximumWorld.x - bounds.minimumWorld.x - 0.2;
        const fasciaHeight = bounds.maximumWorld.y - bounds.minimumWorld.y - 0.16;
        const fascia = this._artwork('liveEventConceptFascia', 1536,
            Math.round(1536 * fasciaHeight / fasciaWidth), this._brandLogo, 3);
        this._plane('liveEventConceptDJFascia', fasciaWidth, fasciaHeight,
            bounds.centerWorld.x, bounds.centerWorld.y, bounds.maximumWorld.z + 0.025, fascia);
        const logo = this._artwork('liveEventConceptLogoArtwork', 512, 344, this._brandLogo);
        const posterHeight = 3.2 * 344 / 512;
        const room = window.ROOM_INTERIOR;
        for (const side of [-1, 1]) {
            const wallX = side < 0 ? room.x.min + 0.035 : room.x.max - 0.035;
            for (const z of [-8.2, -13.2]) {
                this._plane(`liveEventConceptWall${side}_${z}`, 3.2, posterHeight,
                    wallX, 5.7, z, logo, side * Math.PI / 2);
            }
            this._plane(`liveEventConceptFrontWall${side}`, 3.2, posterHeight,
                side * 6, 3.8, room.z.max - 0.035, logo, 0);
        }
        this._createEntranceDressing(logo);
        this._mergeDressing();
    }

    _createEntranceDressing(sign) {
        const vestibule = window.VenueLayout.vestibule;
        const doorZ = window.CityLayout.doorZ;
        const ground = vestibule.streetLevel;
        const flag = this._artwork('liveEventConceptFlag', 512, 640, this._brandLogo);
        const builder = this.club._dressingBuilder('liveEventConcept');
        const poles = builder.group('FlagPoles', this.club.materialFactory.getPreset('rail'));
        for (const side of [-1, 1]) {
            this._plane(`liveEventConceptEntranceSign${side}`, 1.25, 1.25 * 344 / 512,
                side * (vestibule.doorHalfWidth + 0.9), ground + 1.65, doorZ + 0.035, sign);
            const x = side * (vestibule.halfWidth - 0.35);
            this._plane(`liveEventConceptEntranceFlag${side}`, 1, 1.25,
                x, ground + 2.8, doorZ + 0.75, flag, side * Math.PI / 2, true);
            builder.box(poles, 0.045, 0.045, 1.4, x, ground + 3.45, doorZ + 0.7);
            builder.box(poles, 0.16, 0.24, 0.06, x, ground + 3.45, doorZ + 0.025);
        }
        for (const mesh of Object.values(builder.finish())) {
            mesh.parent = this.root;
            this._meshes.push(mesh);
        }
    }

    _artwork(name, width, height, image, repeat = 1) {
        const texture = new BABYLON.DynamicTexture(name, { width, height }, this.club.scene, false);
        this._textures.push(texture);
        const ctx = texture.getContext();
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(0, 0, width, height);
        const cellWidth = width / repeat;
        const scale = Math.min(cellWidth * 0.86 / image.naturalWidth, height * 0.86 / image.naturalHeight);
        const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
        for (let i = 0; i < repeat; i++) {
            ctx.drawImage(image, cellWidth * (i + 0.5) - w / 2, (height - h) / 2, w, h);
        }
        texture.update();
        texture.level = 1.1;
        return texture;
    }

    _mergeDressing() {
        for (const material of this._materials) {
            const group = this._meshes.filter(mesh => mesh.material === material);
            if (group.length < 2) continue;
            const merged = BABYLON.Mesh.MergeMeshes(group, true, true);
            if (!merged) throw new Error('Could not merge the ADE venue signs.');
            merged.name = `${material.name}Batch`;
            merged.parent = this.root;
            merged.isPickable = false;
            this._meshes = this._meshes.filter(mesh => !group.includes(mesh));
            this._meshes.push(merged);
        }
    }

    async _loadBrandArtwork() {
        try {
            const blob = await fetchBlobWithTimeout('concept-assets/ade/ade26-30y-black.png', { timeoutMs: 10000 });
            const url = URL.createObjectURL(blob);
            try {
                const image = new Image();
                image.src = url;
                await image.decode();
                this._brandLogo = image;
            } finally {
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            throw new Error(`ADE review artwork is unavailable. Use npm run build:ade-pitch for a pitch build. ${error.message}`);
        }
    }

    _plane(name, width, height, x, y, z, texture, yaw = Math.PI, doubleSided = false) {
        const options = { width, height };
        if (doubleSided) {
            options.sideOrientation = BABYLON.Mesh.DOUBLESIDE;
            options.backUVs = new BABYLON.Vector4(1, 0, 0, 1);
        }
        const mesh = BABYLON.MeshBuilder.CreatePlane(name, options, this.club.scene);
        this._meshes.push(mesh);
        mesh.parent = this.root;
        mesh.position.set(x, y, z);
        mesh.rotation.y = yaw;
        mesh.isPickable = false;
        let material = this._materials.find(candidate => candidate.emissiveTexture === texture);
        if (!material) {
            material = this.club.materialFactory.createStandardMaterial(`${name}Material`, {
                emissiveTexture: texture,
                diffuseColor: [0, 0, 0],
                disableLighting: true,
                mutable: true
            });
            this._materials.push(material);
        }
        mesh.material = material;
        return mesh;
    }

    _syncAvailability() {
        this.toggle.hidden = !!this.club.isInVRMode;
        if (this.club.isInVRMode) this.setPanelOpen(false);
    }

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        clearInterval(this._timer);
        for (const [element, type, listener] of this._listeners) element.removeEventListener(type, listener);
        this._listeners.length = 0;
        this._brandLogo = null;
        for (const mesh of this._meshes) mesh.dispose();
        for (const material of this._materials) material.dispose();
        for (const texture of this._textures) texture.dispose();
        this.root?.dispose();
        if (this.panel) this.panel.hidden = true;
        if (this.toggle) this.toggle.hidden = true;
    }
}

window.LiveEventConcept = LiveEventConcept;
