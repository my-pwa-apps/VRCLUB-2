/**
 * AvatarManager - Manages remote player avatars in VR Club
 * Creates and updates visual representations of other players
 */
class AvatarManager {
    constructor(scene, materialFactory) {
        this.scene = scene;
        this.materialFactory = materialFactory;
        this.avatars = new Map(); // playerId -> avatar object
        
        // Shared materials for efficiency
        this.bodyMaterial = this.createBodyMaterial();
        this.headMaterial = this.createHeadMaterial();
        this.handMaterial = this.createHandMaterial();
        
        console.log('👥 AvatarManager initialized');
    }
    
    createBodyMaterial() {
        const mat = new BABYLON.PBRMetallicRoughnessMaterial('avatarBody', this.scene);
        mat.baseColor = new BABYLON.Color3(0.3, 0.5, 0.8); // Blue tint
        mat.metallic = 0.1;
        mat.roughness = 0.8;
        mat.emissiveColor = new BABYLON.Color3(0.1, 0.2, 0.3);
        return mat;
    }
    
    createHeadMaterial() {
        const mat = new BABYLON.PBRMetallicRoughnessMaterial('avatarHead', this.scene);
        mat.baseColor = new BABYLON.Color3(0.9, 0.7, 0.6); // Skin tone
        mat.metallic = 0.0;
        mat.roughness = 0.7;
        return mat;
    }
    
    createHandMaterial() {
        const mat = new BABYLON.PBRMetallicRoughnessMaterial('avatarHand', this.scene);
        mat.baseColor = new BABYLON.Color3(0.9, 0.7, 0.6); // Skin tone
        mat.metallic = 0.0;
        mat.roughness = 0.7;
        return mat;
    }
    
    createAvatar(playerId, playerData) {
        if (this.avatars.has(playerId)) {
            console.warn(`Avatar for player ${playerId} already exists`);
            return;
        }
        
        const isVR = playerData.isVR || false;
        const avatar = {
            playerId: playerId,
            username: playerData.username || `Player${playerId}`,
            isVR: isVR,
            root: null,
            body: null,
            head: null,
            leftHand: null,
            rightHand: null,
            nameLabel: null
        };
        
        // Create root node for avatar
        avatar.root = new BABYLON.TransformNode(`avatar_${playerId}`, this.scene);
        
        if (isVR) {
            // VR avatar with head + hands tracking
            avatar.head = this.createHead(playerId);
            avatar.head.parent = avatar.root;
            
            avatar.leftHand = this.createHand(playerId, 'left');
            avatar.leftHand.parent = avatar.root;
            
            avatar.rightHand = this.createHand(playerId, 'right');
            avatar.rightHand.parent = avatar.root;
        } else {
            // Desktop avatar - simple capsule representation
            avatar.body = this.createBody(playerId);
            avatar.body.parent = avatar.root;
            
            avatar.head = this.createHead(playerId);
            avatar.head.parent = avatar.body;
            avatar.head.position.y = 0.4;
        }
        
        // Create name label
        avatar.nameLabel = this.createNameLabel(playerId, avatar.username);
        avatar.nameLabel.parent = avatar.root;
        
        // Set initial position
        if (playerData.position) {
            avatar.root.position = new BABYLON.Vector3(
                playerData.position.x,
                playerData.position.y,
                playerData.position.z
            );
        }
        
        this.avatars.set(playerId, avatar);
        console.log(`✅ Created avatar for ${avatar.username} (${isVR ? 'VR' : 'Desktop'})`);
        
        return avatar;
    }
    
    createBody(playerId) {
        const body = BABYLON.MeshBuilder.CreateCapsule(`body_${playerId}`, {
            height: 1.6,
            radius: 0.3
        }, this.scene);
        body.material = this.bodyMaterial;
        body.isPickable = false;
        return body;
    }
    
    createHead(playerId) {
        const head = BABYLON.MeshBuilder.CreateSphere(`head_${playerId}`, {
            diameter: 0.3,
            segments: 8
        }, this.scene);
        head.material = this.headMaterial;
        head.isPickable = false;
        
        // Add simple "eyes" for direction indicator
        const leftEye = BABYLON.MeshBuilder.CreateSphere(`leftEye_${playerId}`, {
            diameter: 0.05,
            segments: 4
        }, this.scene);
        leftEye.position = new BABYLON.Vector3(-0.07, 0.05, 0.12);
        leftEye.parent = head;
        
        const rightEye = BABYLON.MeshBuilder.CreateSphere(`rightEye_${playerId}`, {
            diameter: 0.05,
            segments: 4
        }, this.scene);
        rightEye.position = new BABYLON.Vector3(0.07, 0.05, 0.12);
        rightEye.parent = head;
        
        const eyeMat = new BABYLON.StandardMaterial(`eyeMat_${playerId}`, this.scene);
        eyeMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
        leftEye.material = eyeMat;
        rightEye.material = eyeMat;
        
        return head;
    }
    
    createHand(playerId, side) {
        const hand = BABYLON.MeshBuilder.CreateSphere(`hand_${side}_${playerId}`, {
            diameter: 0.15,
            segments: 6
        }, this.scene);
        hand.material = this.handMaterial;
        hand.isPickable = false;
        
        // Add controller shape
        const controller = BABYLON.MeshBuilder.CreateBox(`controller_${side}_${playerId}`, {
            width: 0.1,
            height: 0.15,
            depth: 0.05
        }, this.scene);
        controller.position.z = 0.05;
        controller.parent = hand;
        controller.material = this.bodyMaterial;
        
        return hand;
    }
    
    createNameLabel(playerId, username) {
        // Create a plane for the name label
        const plane = BABYLON.MeshBuilder.CreatePlane(`nameLabel_${playerId}`, {
            width: 1.5,
            height: 0.3
        }, this.scene);
        plane.position.y = 2.2; // Above head
        plane.billboardMode = BABYLON.Mesh.BILLBOARDMODE_ALL; // Always face camera
        plane.isPickable = false;
        
        // Create dynamic texture for text
        const texture = new BABYLON.DynamicTexture(`nameLabelTexture_${playerId}`, {
            width: 512,
            height: 128
        }, this.scene, false);
        texture.hasAlpha = true;
        
        const context = texture.getContext();
        context.clearRect(0, 0, 512, 128);
        
        // Draw background
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(0, 0, 512, 128);
        
        // Draw text
        context.font = 'bold 48px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(username, 256, 64);
        
        texture.update();
        
        const material = new BABYLON.StandardMaterial(`nameLabelMat_${playerId}`, this.scene);
        material.diffuseTexture = texture;
        material.emissiveTexture = texture;
        material.opacityTexture = texture;
        material.backFaceCulling = false;
        material.disableLighting = true;
        
        plane.material = material;
        
        return plane;
    }
    
    updateAvatar(playerId, updateData) {
        const avatar = this.avatars.get(playerId);
        if (!avatar) return;
        
        // Update position and rotation
        if (updateData.position) {
            avatar.root.position = new BABYLON.Vector3(
                updateData.position.x,
                updateData.position.y,
                updateData.position.z
            );
        }
        
        if (updateData.rotation && !avatar.isVR) {
            // Only rotate body for desktop users
            if (avatar.body) {
                avatar.body.rotation = new BABYLON.Vector3(
                    updateData.rotation.x,
                    updateData.rotation.y,
                    updateData.rotation.z
                );
            }
        }
        
        // Update VR tracking data
        if (avatar.isVR) {
            if (updateData.headPosition && avatar.head) {
                avatar.head.position = new BABYLON.Vector3(
                    updateData.headPosition.x,
                    updateData.headPosition.y,
                    updateData.headPosition.z
                );
            }
            
            if (updateData.leftHandPosition && avatar.leftHand) {
                avatar.leftHand.position = new BABYLON.Vector3(
                    updateData.leftHandPosition.x,
                    updateData.leftHandPosition.y,
                    updateData.leftHandPosition.z
                );
            }
            
            if (updateData.rightHandPosition && avatar.rightHand) {
                avatar.rightHand.position = new BABYLON.Vector3(
                    updateData.rightHandPosition.x,
                    updateData.rightHandPosition.y,
                    updateData.rightHandPosition.z
                );
            }
        }
        
        // Update username if changed
        if (updateData.username && updateData.username !== avatar.username) {
            avatar.username = updateData.username;
            this.updateNameLabel(playerId, updateData.username);
        }
    }
    
    updateNameLabel(playerId, username) {
        const avatar = this.avatars.get(playerId);
        if (!avatar || !avatar.nameLabel) return;
        
        const texture = avatar.nameLabel.material.diffuseTexture;
        const context = texture.getContext();
        
        context.clearRect(0, 0, 512, 128);
        context.fillStyle = 'rgba(0, 0, 0, 0.7)';
        context.fillRect(0, 0, 512, 128);
        context.font = 'bold 48px Arial';
        context.fillStyle = 'white';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(username, 256, 64);
        
        texture.update();
    }
    
    removeAvatar(playerId) {
        const avatar = this.avatars.get(playerId);
        if (!avatar) return;
        
        console.log(`🗑️ Removing avatar for player ${playerId}`);
        
        // Dispose all meshes
        if (avatar.body) avatar.body.dispose();
        if (avatar.head) avatar.head.dispose();
        if (avatar.leftHand) avatar.leftHand.dispose();
        if (avatar.rightHand) avatar.rightHand.dispose();
        if (avatar.nameLabel) avatar.nameLabel.dispose();
        if (avatar.root) avatar.root.dispose();
        
        this.avatars.delete(playerId);
    }
    
    removeAllAvatars() {
        this.avatars.forEach((avatar, playerId) => {
            this.removeAvatar(playerId);
        });
        this.avatars.clear();
    }
    
    getAvatar(playerId) {
        return this.avatars.get(playerId);
    }
    
    getAllAvatars() {
        return Array.from(this.avatars.values());
    }
    
    getPlayerCount() {
        return this.avatars.size;
    }
}
