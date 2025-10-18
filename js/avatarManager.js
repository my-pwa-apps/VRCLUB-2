/**
 * AvatarManager - Manages remote player avatars in VR Club
 * Creates and updates visual representations of other players
 */
class AvatarManager {
    constructor(scene, materialFactory, readyPlayerMeLoader = null) {
        this.scene = scene;
        this.materialFactory = materialFactory;
        this.avatars = new Map(); // playerId -> avatar object
        this.rpmLoader = readyPlayerMeLoader; // Optional RPM integration
        
        // Shared materials for efficiency
        this.bodyMaterial = this.createBodyMaterial();
        this.headMaterial = this.createHeadMaterial();
        this.handMaterial = this.createHandMaterial();
        
        console.log('👥 AvatarManager initialized' + (this.rpmLoader ? ' with Ready Player Me' : ' (procedural mode)'));
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
    
    async createAvatar(playerId, playerData) {
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
            nameLabel: null,
            isRPM: false, // Track if using Ready Player Me
            rpmMeshes: [] // Store RPM meshes for cleanup
        };
        
        // Try to load Ready Player Me avatar first (if available)
        if (this.rpmLoader && !isVR) {
            const rpmMeshes = await this.rpmLoader.loadRandomAvatar(playerId);
            
            if (rpmMeshes && rpmMeshes.length > 0) {
                console.log(`✅ Using Ready Player Me avatar for ${playerData.username}`);
                avatar.isRPM = true;
                avatar.rpmMeshes = rpmMeshes;
                avatar.root = rpmMeshes[0]; // Root is first mesh
                
                // Position avatar
                if (playerData.position) {
                    avatar.root.position = new BABYLON.Vector3(
                        playerData.position.x,
                        playerData.position.y,
                        playerData.position.z
                    );
                }
                
                // Create name label
                avatar.nameLabel = this.createNameLabel(playerId, avatar.username);
                avatar.nameLabel.parent = avatar.root;
                avatar.nameLabel.position.y = 2.2;
                
                this.avatars.set(playerId, avatar);
                console.log(`✅ Created RPM avatar for ${avatar.username}`);
                
                return avatar;
            }
        }
        
        // Fallback to procedural avatar
        console.log(`🔧 Creating procedural avatar for ${playerData.username}`);
        
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
            // Desktop avatar - full humanlike body with limbs
            avatar.body = this.createBody(playerId);
            avatar.body.parent = avatar.root;
            
            avatar.head = this.createHead(playerId);
            avatar.head.parent = avatar.body;
            avatar.head.position.y = 0.9; // Position on top of torso
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
        // Create humanlike body with proper proportions
        const bodyRoot = new BABYLON.TransformNode(`bodyRoot_${playerId}`, this.scene);
        bodyRoot.isPickable = false;
        
        // Torso (chest + abdomen)
        const torso = BABYLON.MeshBuilder.CreateCylinder(`torso_${playerId}`, {
            height: 0.6,
            diameterTop: 0.4,
            diameterBottom: 0.35,
            tessellation: 12
        }, this.scene);
        torso.position.y = 0.6;
        torso.material = this.bodyMaterial;
        torso.parent = bodyRoot;
        
        // Hips/pelvis
        const hips = BABYLON.MeshBuilder.CreateCylinder(`hips_${playerId}`, {
            height: 0.25,
            diameter: 0.38,
            tessellation: 12
        }, this.scene);
        hips.position.y = 0.25;
        hips.material = this.bodyMaterial;
        hips.parent = bodyRoot;
        
        // Left leg (thigh + calf)
        const leftThigh = BABYLON.MeshBuilder.CreateCylinder(`leftThigh_${playerId}`, {
            height: 0.45,
            diameterTop: 0.16,
            diameterBottom: 0.14,
            tessellation: 10
        }, this.scene);
        leftThigh.position = new BABYLON.Vector3(-0.12, -0.1, 0);
        leftThigh.material = this.bodyMaterial;
        leftThigh.parent = bodyRoot;
        
        const leftCalf = BABYLON.MeshBuilder.CreateCylinder(`leftCalf_${playerId}`, {
            height: 0.45,
            diameterTop: 0.13,
            diameterBottom: 0.11,
            tessellation: 10
        }, this.scene);
        leftCalf.position = new BABYLON.Vector3(-0.12, -0.55, 0);
        leftCalf.material = this.bodyMaterial;
        leftCalf.parent = bodyRoot;
        
        // Left foot
        const leftFoot = BABYLON.MeshBuilder.CreateBox(`leftFoot_${playerId}`, {
            width: 0.12,
            height: 0.08,
            depth: 0.25
        }, this.scene);
        leftFoot.position = new BABYLON.Vector3(-0.12, -0.82, 0.05);
        leftFoot.material = this.bodyMaterial;
        leftFoot.parent = bodyRoot;
        
        // Right leg (thigh + calf)
        const rightThigh = BABYLON.MeshBuilder.CreateCylinder(`rightThigh_${playerId}`, {
            height: 0.45,
            diameterTop: 0.16,
            diameterBottom: 0.14,
            tessellation: 10
        }, this.scene);
        rightThigh.position = new BABYLON.Vector3(0.12, -0.1, 0);
        rightThigh.material = this.bodyMaterial;
        rightThigh.parent = bodyRoot;
        
        const rightCalf = BABYLON.MeshBuilder.CreateCylinder(`rightCalf_${playerId}`, {
            height: 0.45,
            diameterTop: 0.13,
            diameterBottom: 0.11,
            tessellation: 10
        }, this.scene);
        rightCalf.position = new BABYLON.Vector3(0.12, -0.55, 0);
        rightCalf.material = this.bodyMaterial;
        rightCalf.parent = bodyRoot;
        
        // Right foot
        const rightFoot = BABYLON.MeshBuilder.CreateBox(`rightFoot_${playerId}`, {
            width: 0.12,
            height: 0.08,
            depth: 0.25
        }, this.scene);
        rightFoot.position = new BABYLON.Vector3(0.12, -0.82, 0.05);
        rightFoot.material = this.bodyMaterial;
        rightFoot.parent = bodyRoot;
        
        // Left arm (upper + lower)
        const leftUpperArm = BABYLON.MeshBuilder.CreateCylinder(`leftUpperArm_${playerId}`, {
            height: 0.35,
            diameter: 0.10,
            tessellation: 8
        }, this.scene);
        leftUpperArm.position = new BABYLON.Vector3(-0.28, 0.55, 0);
        leftUpperArm.rotation.z = Math.PI / 12; // Slight angle
        leftUpperArm.material = this.bodyMaterial;
        leftUpperArm.parent = bodyRoot;
        
        const leftLowerArm = BABYLON.MeshBuilder.CreateCylinder(`leftLowerArm_${playerId}`, {
            height: 0.32,
            diameterTop: 0.09,
            diameterBottom: 0.08,
            tessellation: 8
        }, this.scene);
        leftLowerArm.position = new BABYLON.Vector3(-0.32, 0.22, 0);
        leftLowerArm.rotation.z = Math.PI / 8;
        leftLowerArm.material = this.bodyMaterial;
        leftLowerArm.parent = bodyRoot;
        
        // Right arm (upper + lower)
        const rightUpperArm = BABYLON.MeshBuilder.CreateCylinder(`rightUpperArm_${playerId}`, {
            height: 0.35,
            diameter: 0.10,
            tessellation: 8
        }, this.scene);
        rightUpperArm.position = new BABYLON.Vector3(0.28, 0.55, 0);
        rightUpperArm.rotation.z = -Math.PI / 12;
        rightUpperArm.material = this.bodyMaterial;
        rightUpperArm.parent = bodyRoot;
        
        const rightLowerArm = BABYLON.MeshBuilder.CreateCylinder(`rightLowerArm_${playerId}`, {
            height: 0.32,
            diameterTop: 0.09,
            diameterBottom: 0.08,
            tessellation: 8
        }, this.scene);
        rightLowerArm.position = new BABYLON.Vector3(0.32, 0.22, 0);
        rightLowerArm.rotation.z = -Math.PI / 8;
        rightLowerArm.material = this.bodyMaterial;
        rightLowerArm.parent = bodyRoot;
        
        // Hands
        const leftHand = BABYLON.MeshBuilder.CreateSphere(`leftHandMesh_${playerId}`, {
            diameter: 0.10,
            segments: 8
        }, this.scene);
        leftHand.position = new BABYLON.Vector3(-0.36, 0.05, 0);
        leftHand.material = this.headMaterial; // Skin tone
        leftHand.parent = bodyRoot;
        
        const rightHand = BABYLON.MeshBuilder.CreateSphere(`rightHandMesh_${playerId}`, {
            diameter: 0.10,
            segments: 8
        }, this.scene);
        rightHand.position = new BABYLON.Vector3(0.36, 0.05, 0);
        rightHand.material = this.headMaterial; // Skin tone
        rightHand.parent = bodyRoot;
        
        return bodyRoot;
    }
    
    createHead(playerId) {
        // Create more realistic head with neck
        const headRoot = new BABYLON.TransformNode(`headRoot_${playerId}`, this.scene);
        headRoot.isPickable = false;
        
        // Neck
        const neck = BABYLON.MeshBuilder.CreateCylinder(`neck_${playerId}`, {
            height: 0.15,
            diameter: 0.12,
            tessellation: 10
        }, this.scene);
        neck.position.y = -0.075;
        neck.material = this.headMaterial;
        neck.parent = headRoot;
        
        // Head (more oval shaped)
        const head = BABYLON.MeshBuilder.CreateSphere(`head_${playerId}`, {
            diameter: 0.24,
            segments: 16
        }, this.scene);
        head.scaling.y = 1.15; // Make it slightly taller (more human proportions)
        head.scaling.z = 0.95; // Slightly narrower front-to-back
        head.position.y = 0.05;
        head.material = this.headMaterial;
        head.parent = headRoot;
        head.isPickable = false;
        
        // Eyes (larger, more detailed)
        const leftEye = BABYLON.MeshBuilder.CreateSphere(`leftEye_${playerId}`, {
            diameter: 0.045,
            segments: 8
        }, this.scene);
        leftEye.position = new BABYLON.Vector3(-0.055, 0.08, 0.10);
        leftEye.parent = headRoot;
        
        const rightEye = BABYLON.MeshBuilder.CreateSphere(`rightEye_${playerId}`, {
            diameter: 0.045,
            segments: 8
        }, this.scene);
        rightEye.position = new BABYLON.Vector3(0.055, 0.08, 0.10);
        rightEye.parent = headRoot;
        
        // Eye whites
        const eyeWhiteMat = new BABYLON.StandardMaterial(`eyeWhite_${playerId}`, this.scene);
        eyeWhiteMat.diffuseColor = new BABYLON.Color3(0.95, 0.95, 0.95);
        eyeWhiteMat.emissiveColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        leftEye.material = eyeWhiteMat;
        rightEye.material = eyeWhiteMat;
        
        // Pupils
        const leftPupil = BABYLON.MeshBuilder.CreateSphere(`leftPupil_${playerId}`, {
            diameter: 0.025,
            segments: 6
        }, this.scene);
        leftPupil.position = new BABYLON.Vector3(0, 0, 0.018);
        leftPupil.parent = leftEye;
        
        const rightPupil = BABYLON.MeshBuilder.CreateSphere(`rightPupil_${playerId}`, {
            diameter: 0.025,
            segments: 6
        }, this.scene);
        rightPupil.position = new BABYLON.Vector3(0, 0, 0.018);
        rightPupil.parent = rightEye;
        
        const pupilMat = new BABYLON.StandardMaterial(`pupil_${playerId}`, this.scene);
        pupilMat.diffuseColor = new BABYLON.Color3(0.1, 0.1, 0.1);
        pupilMat.emissiveColor = new BABYLON.Color3(0, 0, 0);
        leftPupil.material = pupilMat;
        rightPupil.material = pupilMat;
        
        // Nose (simple but visible)
        const nose = BABYLON.MeshBuilder.CreateCylinder(`nose_${playerId}`, {
            height: 0.06,
            diameterTop: 0.015,
            diameterBottom: 0.025,
            tessellation: 8
        }, this.scene);
        nose.position = new BABYLON.Vector3(0, 0.02, 0.115);
        nose.rotation.x = Math.PI / 2;
        nose.material = this.headMaterial;
        nose.parent = headRoot;
        
        // Mouth (simple line)
        const mouth = BABYLON.MeshBuilder.CreateBox(`mouth_${playerId}`, {
            width: 0.08,
            height: 0.015,
            depth: 0.02
        }, this.scene);
        mouth.position = new BABYLON.Vector3(0, -0.02, 0.105);
        const mouthMat = new BABYLON.StandardMaterial(`mouth_${playerId}`, this.scene);
        mouthMat.diffuseColor = new BABYLON.Color3(0.3, 0.1, 0.1);
        mouthMat.emissiveColor = new BABYLON.Color3(0.1, 0, 0);
        mouth.material = mouthMat;
        mouth.parent = headRoot;
        
        // Ears
        const leftEar = BABYLON.MeshBuilder.CreateSphere(`leftEar_${playerId}`, {
            diameter: 0.06,
            segments: 6
        }, this.scene);
        leftEar.scaling.z = 0.5; // Flatten
        leftEar.position = new BABYLON.Vector3(-0.12, 0.05, 0);
        leftEar.material = this.headMaterial;
        leftEar.parent = headRoot;
        
        const rightEar = BABYLON.MeshBuilder.CreateSphere(`rightEar_${playerId}`, {
            diameter: 0.06,
            segments: 6
        }, this.scene);
        rightEar.scaling.z = 0.5;
        rightEar.position = new BABYLON.Vector3(0.12, 0.05, 0);
        rightEar.material = this.headMaterial;
        rightEar.parent = headRoot;
        
        return headRoot;
    }
    
    createHand(playerId, side) {
        const handRoot = new BABYLON.TransformNode(`handRoot_${side}_${playerId}`, this.scene);
        handRoot.isPickable = false;
        
        // Palm
        const palm = BABYLON.MeshBuilder.CreateBox(`palm_${side}_${playerId}`, {
            width: 0.09,
            height: 0.11,
            depth: 0.03
        }, this.scene);
        palm.material = this.handMaterial;
        palm.parent = handRoot;
        
        // Fingers (simplified as 3 segments)
        const fingerPositions = [
            { x: -0.035, name: 'pinky' },
            { x: -0.012, name: 'ring' },
            { x: 0.012, name: 'middle' },
            { x: 0.035, name: 'index' }
        ];
        
        fingerPositions.forEach(finger => {
            const fingerMesh = BABYLON.MeshBuilder.CreateCylinder(`${finger.name}_${side}_${playerId}`, {
                height: 0.06,
                diameter: 0.012,
                tessellation: 6
            }, this.scene);
            fingerMesh.position = new BABYLON.Vector3(finger.x, 0.08, 0);
            fingerMesh.rotation.z = Math.random() * 0.2 - 0.1; // Slight random bend
            fingerMesh.material = this.handMaterial;
            fingerMesh.parent = handRoot;
        });
        
        // Thumb
        const thumb = BABYLON.MeshBuilder.CreateCylinder(`thumb_${side}_${playerId}`, {
            height: 0.05,
            diameter: 0.015,
            tessellation: 6
        }, this.scene);
        const thumbX = side === 'left' ? -0.05 : 0.05;
        thumb.position = new BABYLON.Vector3(thumbX, 0.02, 0.02);
        thumb.rotation.z = side === 'left' ? Math.PI / 4 : -Math.PI / 4;
        thumb.material = this.handMaterial;
        thumb.parent = handRoot;
        
        // VR Controller (Quest-style)
        const controller = BABYLON.MeshBuilder.CreateCylinder(`controller_${side}_${playerId}`, {
            height: 0.15,
            diameterTop: 0.04,
            diameterBottom: 0.045,
            tessellation: 12
        }, this.scene);
        controller.position = new BABYLON.Vector3(0, -0.08, 0.01);
        controller.rotation.x = Math.PI / 8; // Slight angle
        controller.parent = handRoot;
        
        const controllerMat = new BABYLON.PBRMetallicRoughnessMaterial(`controllerMat_${side}_${playerId}`, this.scene);
        controllerMat.baseColor = new BABYLON.Color3(0.15, 0.15, 0.15);
        controllerMat.metallic = 0.4;
        controllerMat.roughness = 0.6;
        controller.material = controllerMat;
        
        // Controller ring
        const ring = BABYLON.MeshBuilder.CreateTorus(`controllerRing_${side}_${playerId}`, {
            diameter: 0.12,
            thickness: 0.015,
            tessellation: 20
        }, this.scene);
        ring.position.y = -0.12;
        ring.rotation.x = Math.PI / 2;
        ring.material = controllerMat;
        ring.parent = handRoot;
        
        return handRoot;
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
        
        // Dispose RPM meshes if applicable
        if (avatar.isRPM && avatar.rpmMeshes) {
            avatar.rpmMeshes.forEach(mesh => {
                if (mesh && mesh.dispose) {
                    mesh.dispose();
                }
            });
        }
        
        // Dispose procedural meshes
        if (avatar.body) avatar.body.dispose();
        if (avatar.head) avatar.head.dispose();
        if (avatar.leftHand) avatar.leftHand.dispose();
        if (avatar.rightHand) avatar.rightHand.dispose();
        if (avatar.nameLabel) avatar.nameLabel.dispose();
        if (avatar.root && !avatar.isRPM) avatar.root.dispose(); // Don't dispose RPM root twice
        
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
