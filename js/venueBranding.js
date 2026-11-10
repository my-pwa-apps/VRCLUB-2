'use strict';

// Additive venue artwork only: it never changes music, show ownership or admission.
class VenueBranding {
    static requested() {
        return document.documentElement.dataset.branding === 'ade';
    }

    constructor(club) {
        this.club = club;
        this._meshes = [];
        this._materials = [];
        this._textures = [];
        this._disposed = false;
    }

    async mount() {
        const blob = await fetchBlobWithTimeout('branding/ade/ade26-30y-black.png', { timeoutMs: 10000 });
        if (this._disposed) return;
        const url = URL.createObjectURL(blob);
        try {
            const image = new Image();
            image.src = url;
            await image.decode();
            if (this._disposed) return;
            this._brandLogo = image;
            this._createDressing();
        } finally {
            this._brandLogo = null;
            URL.revokeObjectURL(url);
        }
    }

    _createDressing() {
        this.root = new BABYLON.TransformNode('venueBrandingRoot', this.club.scene);
        const table = this.club.scene.getMeshByName('djTable');
        if (!table) throw new Error('Venue branding requires the built DJ table.');
        table.computeWorldMatrix(true);
        const bounds = table.getBoundingInfo().boundingBox;
        const width = bounds.maximumWorld.x - bounds.minimumWorld.x - 0.2;
        const height = bounds.maximumWorld.y - bounds.minimumWorld.y - 0.16;
        const fascia = this._artwork('venueBrandingFascia', 1536, Math.round(1536 * height / width), 3);
        this._plane('venueBrandingDJFascia', width, height,
            bounds.centerWorld.x, bounds.centerWorld.y, bounds.maximumWorld.z + 0.025, fascia);
        const logo = this._artwork('venueBrandingLogo', 512, 344);
        const posterHeight = 3.2 * 344 / 512;
        const room = window.ROOM_INTERIOR;
        for (const side of [-1, 1]) {
            const wallX = side < 0 ? room.x.min + 0.035 : room.x.max - 0.035;
            for (const z of [-8.2, -13.2]) {
                this._plane(`venueBrandingWall${side}_${z}`, 3.2, posterHeight,
                    wallX, 5.7, z, logo, side * Math.PI / 2);
            }
            this._plane(`venueBrandingFrontWall${side}`, 3.2, posterHeight,
                side * 6, 3.8, room.z.max - 0.035, logo, 0);
        }
        this._createEntranceDressing(logo);
        this._mergeDressing();
    }

    _createEntranceDressing(sign) {
        const vestibule = window.VenueLayout.vestibule;
        const doorZ = window.CityLayout.doorZ;
        const ground = vestibule.streetLevel;
        const flag = this._artwork('venueBrandingFlag', 512, 640);
        const builder = this.club._dressingBuilder('venueBranding');
        const poles = builder.group('FlagPoles', this.club.materialFactory.getPreset('rail'));
        for (const side of [-1, 1]) {
            this._plane(`venueBrandingEntranceSign${side}`, 1.25, 1.25 * 344 / 512,
                side * (vestibule.doorHalfWidth + 0.9), ground + 1.65, doorZ + 0.035, sign);
            const x = side * (vestibule.halfWidth - 0.35);
            this._plane(`venueBrandingEntranceFlag${side}`, 1, 1.25,
                x, ground + 2.8, doorZ + 0.75, flag, side * Math.PI / 2, true);
            builder.box(poles, 0.045, 0.045, 1.4, x, ground + 3.45, doorZ + 0.7);
            builder.box(poles, 0.16, 0.24, 0.06, x, ground + 3.45, doorZ + 0.025);
        }
        for (const mesh of Object.values(builder.finish())) {
            mesh.parent = this.root;
            this._meshes.push(mesh);
        }
    }

    _artwork(name, width, height, repeat = 1) {
        const texture = new BABYLON.DynamicTexture(name, { width, height }, this.club.scene, false);
        this._textures.push(texture);
        const ctx = texture.getContext();
        ctx.fillStyle = '#ffff00';
        ctx.fillRect(0, 0, width, height);
        const cellWidth = width / repeat;
        const image = this._brandLogo;
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
            if (!merged) throw new Error('Could not merge venue branding signs.');
            merged.name = `${material.name}Batch`;
            merged.parent = this.root;
            merged.isPickable = false;
            this._meshes = this._meshes.filter(mesh => !group.includes(mesh));
            this._meshes.push(merged);
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

    dispose() {
        if (this._disposed) return;
        this._disposed = true;
        this._brandLogo = null;
        for (const mesh of this._meshes) mesh.dispose();
        for (const material of this._materials) material.dispose();
        for (const texture of this._textures) texture.dispose();
        this.root?.dispose();
        this._meshes.length = this._materials.length = this._textures.length = 0;
    }
}

window.VenueBranding = VenueBranding;
