'use strict';
/**
 * AvatarRig - a procedurally animated human for ONE player (the local guest or a
 * remote one), built on the club's shared UE-mannequin dancer skeleton.
 *
 * Why procedural: the dancer GLBs carry a dance (or DJ idle) clip and nothing else, so
 * there is no walk, turn or reach to play. A guest also has to move freely, which no
 * clip can follow. Instead every frame the rig takes where the player IS (position,
 * head yaw/pitch, optionally two hand poses) and poses the skeleton to match:
 *
 *   - feet are planted: stance feet slide back at exactly the player's speed, swing
 *     feet lift and step, and a two-bone IK solve puts each ankle on its target;
 *   - the body turns toward the head with a dead-zone (a real person turns their
 *     hips after their eyes), the head/neck/spine share the remaining twist;
 *   - arms swing against the legs on desktop; in VR each arm is IK'd to its controller
 *     and the hand takes the controller's orientation;
 *   - crouching, flying and the DJ riser fall out of the same maths (root height);
 *   - an explicit seat pose lowers the pelvis onto furniture and keeps both feet planted,
 *     independently of the physical headset height.
 *
 * Maths policy: every rotation is expressed as a rotation of WORLD vectors (aim A at B)
 * and converted to a bone-local quaternion through the parent's world matrix. That keeps
 * the rig independent of the GLB's axis conventions and of any handedness flip the
 * loader applied, so nothing here assumes which bone axis is "forward". Facing and the
 * left/right sense are measured from the skeleton at construction.
 *
 * Allocation: none per frame. Every vector, quaternion and matrix is preallocated.
 */
class AvatarRig {
    static _seq = 0;

    /** Bones the rig drives, by their name in the dancer skeleton. */
    static BONES = [
        'root', 'pelvis', 'spine_01', 'spine_02', 'spine_03', 'neck_01', 'Head',
        'clavicle_l', 'upperarm_l', 'lowerarm_l', 'hand_l',
        'clavicle_r', 'upperarm_r', 'lowerarm_r', 'hand_r',
        'thigh_l', 'calf_l', 'foot_l', 'ball_l',
        'thigh_r', 'calf_r', 'foot_r', 'ball_r',
        'index_01_l', 'pinky_01_l', 'index_01_r', 'pinky_01_r'
    ];

    /**
     * Bone-name aliases across UE Mannequin, Ready Player Me (Tribe XR), Mixamo,
     * Quaternius Modular, and VRM / VRoid humanoid `.glb` rigs.
     */
    static BONE_ALIASES = {
        root: ['root', 'Armature', 'AvatarRoot', 'RootNode', 'Character', 'GeneralSkeleton', 'Root'],
        pelvis: ['pelvis', 'Hips', 'mixamorig:Hips', 'mixamorigHips', 'Body', 'hips', 'Hip', 'J_Bip_C_Hips'],
        spine_01: ['spine_01', 'Spine', 'mixamorig:Spine', 'mixamorigSpine', 'Abdomen', 'spine', 'Spine_01', 'spine1', 'J_Bip_C_Spine'],
        spine_02: ['spine_02', 'Spine1', 'mixamorig:Spine1', 'mixamorigSpine1', 'Torso', 'Chest', 'chest', 'Spine_02', 'spine2', 'J_Bip_C_Chest'],
        spine_03: ['spine_03', 'Spine2', 'mixamorig:Spine2', 'mixamorigSpine2', 'UpperChest', 'upperChest', 'upper_chest', 'Spine_03', 'spine3', 'J_Bip_C_UpperChest'],
        neck_01: ['neck_01', 'Neck', 'mixamorig:Neck', 'mixamorigNeck', 'neck', 'Neck_01', 'J_Bip_C_Neck'],
        Head: ['Head', 'mixamorig:Head', 'mixamorigHead', 'head', 'J_Bip_C_Head'],
        clavicle_l: ['clavicle_l', 'LeftShoulder', 'mixamorig:LeftShoulder', 'mixamorigLeftShoulder', 'Shoulder.L', 'shoulder.L', 'shoulder_l', 'leftShoulder', 'Left_Shoulder', 'J_Bip_L_Shoulder'],
        upperarm_l: ['upperarm_l', 'LeftArm', 'mixamorig:LeftArm', 'mixamorigLeftArm', 'UpperArm.L', 'upper_arm.L', 'upper_arm_l', 'leftUpperArm', 'LeftUpperArm', 'Left_UpperArm', 'J_Bip_L_UpperArm'],
        lowerarm_l: ['lowerarm_l', 'LeftForeArm', 'mixamorig:LeftForeArm', 'mixamorigLeftForeArm', 'LowerArm.L', 'forearm.L', 'forearm_l', 'leftLowerArm', 'LeftLowerArm', 'Left_LowerArm', 'J_Bip_L_LowerArm'],
        hand_l: ['hand_l', 'LeftHand', 'mixamorig:LeftHand', 'mixamorigLeftHand', 'Wrist.L', 'Hand.L', 'hand.L', 'leftHand', 'LeftWrist', 'Left_Hand', 'J_Bip_L_Hand'],
        clavicle_r: ['clavicle_r', 'RightShoulder', 'mixamorig:RightShoulder', 'mixamorigRightShoulder', 'Shoulder.R', 'shoulder.R', 'shoulder_r', 'rightShoulder', 'Right_Shoulder', 'J_Bip_R_Shoulder'],
        upperarm_r: ['upperarm_r', 'RightArm', 'mixamorig:RightArm', 'mixamorigRightArm', 'UpperArm.R', 'upper_arm.R', 'upper_arm_r', 'rightUpperArm', 'RightUpperArm', 'Right_UpperArm', 'J_Bip_R_UpperArm'],
        lowerarm_r: ['lowerarm_r', 'RightForeArm', 'mixamorig:RightForeArm', 'mixamorigRightForeArm', 'LowerArm.R', 'forearm.R', 'forearm_r', 'rightLowerArm', 'RightLowerArm', 'Right_LowerArm', 'J_Bip_R_LowerArm'],
        hand_r: ['hand_r', 'RightHand', 'mixamorig:RightHand', 'mixamorigRightHand', 'Wrist.R', 'Hand.R', 'hand.R', 'rightHand', 'RightWrist', 'Right_Hand', 'J_Bip_R_Hand'],
        thigh_l: ['thigh_l', 'LeftUpLeg', 'mixamorig:LeftUpLeg', 'mixamorigLeftUpLeg', 'UpperLeg.L', 'thigh.L', 'leftUpperLeg', 'LeftUpperLeg', 'Left_UpperLeg', 'J_Bip_L_UpperLeg'],
        calf_l: ['calf_l', 'LeftLeg', 'mixamorig:LeftLeg', 'mixamorigLeftLeg', 'LowerLeg.L', 'shin.L', 'leftLowerLeg', 'LeftLowerLeg', 'Left_LowerLeg', 'J_Bip_L_LowerLeg'],
        foot_l: ['foot_l', 'LeftFoot', 'mixamorig:LeftFoot', 'mixamorigLeftFoot', 'Foot.L', 'foot.L', 'leftFoot', 'Left_Foot', 'J_Bip_L_Foot'],
        ball_l: ['ball_l', 'LeftToeBase', 'mixamorig:LeftToeBase', 'mixamorigLeftToeBase', 'Toes.L', 'Toe.L', 'toe.L', 'leftToes', 'LeftToes', 'Left_Toes', 'J_Bip_L_ToeBase'],
        thigh_r: ['thigh_r', 'RightUpLeg', 'mixamorig:RightUpLeg', 'mixamorigRightUpLeg', 'UpperLeg.R', 'thigh.R', 'rightUpperLeg', 'RightUpperLeg', 'Right_UpperLeg', 'J_Bip_R_UpperLeg'],
        calf_r: ['calf_r', 'RightLeg', 'mixamorig:RightLeg', 'mixamorigRightLeg', 'LowerLeg.R', 'shin.R', 'rightLowerLeg', 'RightLowerLeg', 'Right_LowerLeg', 'J_Bip_R_LowerLeg'],
        foot_r: ['foot_r', 'RightFoot', 'mixamorig:RightFoot', 'mixamorigRightFoot', 'Foot.R', 'foot.R', 'rightFoot', 'Right_Foot', 'J_Bip_R_Foot'],
        ball_r: ['ball_r', 'RightToeBase', 'mixamorig:RightToeBase', 'mixamorigRightToeBase', 'Toes.R', 'Toe.R', 'toe.R', 'rightToes', 'RightToes', 'Right_Toes', 'J_Bip_R_ToeBase'],
        index_01_l: ['index_01_l', 'LeftHandIndex1', 'mixamorig:LeftHandIndex1', 'mixamorigLeftHandIndex1', 'Index1.L', 'f_index.01.L', 'leftIndexProximal', 'LeftIndexProximal', 'J_Bip_L_Index1'],
        pinky_01_l: ['pinky_01_l', 'LeftHandPinky1', 'mixamorig:LeftHandPinky1', 'mixamorigLeftHandPinky1', 'Pinky1.L', 'f_pinky.01.L', 'leftLittleProximal', 'LeftLittleProximal', 'J_Bip_L_Little1', 'LeftHandThumb1', 'Thumb1.L'],
        index_01_r: ['index_01_r', 'RightHandIndex1', 'mixamorig:RightHandIndex1', 'mixamorigRightHandIndex1', 'Index1.R', 'f_index.01.R', 'rightIndexProximal', 'RightIndexProximal', 'J_Bip_R_Index1'],
        pinky_01_r: ['pinky_01_r', 'RightHandPinky1', 'mixamorig:RightHandPinky1', 'mixamorigRightHandPinky1', 'Pinky1.R', 'f_pinky.01.R', 'rightLittleProximal', 'RightLittleProximal', 'J_Bip_R_Little1', 'RightHandThumb1', 'Thumb1.R']
    };

    /** Meshes that would put a skull, hair or a mask around the player's own camera. */
    static HEAD_MESH = /head|hair|eye|teeth|neck|skull|face|brow|ear|mask|beard|glasses|headwear|superhero|sphere\.005|plane\.002|cylinder\.002/i;

    static _normalizeBoneName(name) {
        return String(name || '')
            .replace(/^(?:mixamorig:|mixamorig_|mixamorig|armature\||character\||bip01_|bip001_)/i, '')
            .toLowerCase();
    }

    static _findBoneNode(rawByName, normByName, key) {
        const aliases = AvatarRig.BONE_ALIASES[key] || [key];
        for (let i = 0; i < aliases.length; i++) {
            const exact = rawByName[aliases[i]];
            if (exact) return exact;
        }
        for (let i = 0; i < aliases.length; i++) {
            const norm = normByName[AvatarRig._normalizeBoneName(aliases[i])];
            if (norm) return norm;
        }
        return null;
    }

    /**
     * Resolve `AvatarRig.BONES` on a hierarchy, bridging optional spine/neck/clavicle joints and
     * synthesizing missing leaf/leg effectors (such as half-body Ready Player Me VR avatars).
     */
    static _resolveBoneNodes(root, strip, hierarchy, allowCustom = false) {
        const rawByName = {};
        const normByName = {};
        for (let i = 0; i < hierarchy.length; i++) {
            const node = hierarchy[i];
            const raw = node.name.startsWith(strip) ? node.name.slice(strip.length) : node.name;
            if (!rawByName[raw]) rawByName[raw] = node;
            const norm = AvatarRig._normalizeBoneName(raw);
            if (norm && !normByName[norm]) normByName[norm] = node;
        }
        const nodes = {};
        let exactAll = true;
        for (let i = 0; i < AvatarRig.BONES.length; i++) {
            const name = AvatarRig.BONES[i];
            if (rawByName[name]) {
                nodes[name] = rawByName[name];
            } else {
                exactAll = false;
            }
        }
        if (exactAll) return { nodes, rigMode: 'full', synthNodes: [] };
        if (!allowCustom) return null;

        for (let i = 0; i < AvatarRig.BONES.length; i++) {
            const name = AvatarRig.BONES[i];
            const found = AvatarRig._findBoneNode(rawByName, normByName, name);
            if (found) nodes[name] = found;
        }

        const core = ['pelvis', 'spine_01', 'Head', 'upperarm_l', 'lowerarm_l', 'hand_l', 'upperarm_r', 'lowerarm_r', 'hand_r'];
        for (let i = 0; i < core.length; i++) {
            if (!nodes[core[i]]) return null;
        }

        nodes.root = nodes.root || nodes.pelvis.parent || root;
        nodes.spine_02 = nodes.spine_02 || nodes.spine_01;
        nodes.spine_03 = nodes.spine_03 || nodes.spine_02 || nodes.spine_01;
        nodes.neck_01 = nodes.neck_01 || nodes.Head;
        nodes.clavicle_l = nodes.clavicle_l || nodes.upperarm_l.parent || nodes.spine_03;
        nodes.clavicle_r = nodes.clavicle_r || nodes.upperarm_r.parent || nodes.spine_03;

        root.computeWorldMatrix(true);
        for (let i = 0; i < hierarchy.length; i++) hierarchy[i].computeWorldMatrix(true);

        const V = BABYLON.Vector3, Q = BABYLON.Quaternion;
        const pelW = nodes.pelvis.getAbsolutePosition();
        const headW = nodes.Head.getAbsolutePosition();
        const ulW = nodes.upperarm_l.getAbsolutePosition();
        const urW = nodes.upperarm_r.getAbsolutePosition();
        const torsoH = Math.max(0.1, V.Distance(pelW, headW));
        const leftDir = new V(ulW.x - urW.x, 0, ulW.z - urW.z);
        if (leftDir.lengthSquared() > 1e-6) leftDir.normalize();
        else leftDir.set(1, 0, 0);
        const fwdDir = new V(-leftDir.z, 0, leftDir.x);

        const synthNodes = [];
        const scene = root.getScene ? root.getScene() : null;
        const makeSynth = (name, parentNode, worldPos) => {
            const tn = new BABYLON.TransformNode(`${strip}${name}`, scene);
            tn.parent = parentNode;
            parentNode.computeWorldMatrix(true);
            const inv = parentNode.getWorldMatrix().clone().invert();
            const localPos = V.TransformCoordinates(worldPos, inv);
            tn.position.copyFrom(localPos);
            tn.rotationQuaternion = Q.Identity();
            tn.scaling.setAll(1);
            tn.computeWorldMatrix(true);
            hierarchy.push(tn);
            synthNodes.push(tn);
            return tn;
        };

        let rigMode = 'full';
        const hasLegs = !!(nodes.thigh_l && nodes.calf_l && nodes.foot_l && nodes.thigh_r && nodes.calf_r && nodes.foot_r);
        if (!hasLegs) {
            rigMode = 'upper-body';
            for (const [sfx, sign] of [['l', 1], ['r', -1]]) {
                const hipW = new V(
                    pelW.x + leftDir.x * sign * torsoH * 0.16,
                    pelW.y - torsoH * 0.06,
                    pelW.z + leftDir.z * sign * torsoH * 0.16
                );
                const kneeW = new V(hipW.x, hipW.y - torsoH * 0.68, hipW.z);
                const ankleW = new V(kneeW.x, kneeW.y - torsoH * 0.68, kneeW.z);
                const toeW = new V(
                    ankleW.x + fwdDir.x * torsoH * 0.22,
                    ankleW.y - torsoH * 0.08,
                    ankleW.z + fwdDir.z * torsoH * 0.22
                );
                nodes[`thigh_${sfx}`] = makeSynth(`synth_thigh_${sfx}`, nodes.pelvis, hipW);
                nodes[`calf_${sfx}`] = makeSynth(`synth_calf_${sfx}`, nodes[`thigh_${sfx}`], kneeW);
                nodes[`foot_${sfx}`] = makeSynth(`synth_foot_${sfx}`, nodes[`calf_${sfx}`], ankleW);
                nodes[`ball_${sfx}`] = makeSynth(`synth_ball_${sfx}`, nodes[`foot_${sfx}`], toeW);
            }
        } else {
            for (const sfx of ['l', 'r']) {
                if (!nodes[`ball_${sfx}`]) {
                    const ankleW = nodes[`foot_${sfx}`].getAbsolutePosition();
                    const toeW = new V(
                        ankleW.x + fwdDir.x * torsoH * 0.22,
                        ankleW.y,
                        ankleW.z + fwdDir.z * torsoH * 0.22
                    );
                    nodes[`ball_${sfx}`] = makeSynth(`synth_ball_${sfx}`, nodes[`foot_${sfx}`], toeW);
                }
            }
        }

        for (const [sfx, sign] of [['l', 1], ['r', -1]]) {
            if (!nodes[`index_01_${sfx}`] || !nodes[`pinky_01_${sfx}`]) {
                const wristW = nodes[`hand_${sfx}`].getAbsolutePosition();
                const elbowW = nodes[`lowerarm_${sfx}`].getAbsolutePosition();
                const armDir = wristW.subtract(elbowW);
                if (armDir.lengthSquared() > 1e-6) armDir.normalize();
                else armDir.set(leftDir.x * sign, -0.5, leftDir.z * sign).normalize();
                if (!nodes[`index_01_${sfx}`]) {
                    const idxW = new V(
                        wristW.x + armDir.x * torsoH * 0.11 + fwdDir.x * torsoH * 0.04,
                        wristW.y + armDir.y * torsoH * 0.11 + fwdDir.y * torsoH * 0.04,
                        wristW.z + armDir.z * torsoH * 0.11 + fwdDir.z * torsoH * 0.04
                    );
                    nodes[`index_01_${sfx}`] = makeSynth(`synth_index_${sfx}`, nodes[`hand_${sfx}`], idxW);
                }
                if (!nodes[`pinky_01_${sfx}`]) {
                    const pkyW = new V(
                        wristW.x + armDir.x * torsoH * 0.11 - fwdDir.x * torsoH * 0.04,
                        wristW.y + armDir.y * torsoH * 0.11 - fwdDir.y * torsoH * 0.04,
                        wristW.z + armDir.z * torsoH * 0.11 - fwdDir.z * torsoH * 0.04
                    );
                    nodes[`pinky_01_${sfx}`] = makeSynth(`synth_pinky_${sfx}`, nodes[`hand_${sfx}`], pkyW);
                }
            }
        }

        return { nodes, rigMode, synthNodes };
    }

    /**
     * @param {object} club  the VRClub (scene, _prepareAvatarMaterials)
     * @param {BABYLON.AssetContainer} container a humanoid skeleton (UE-mannequin, Ready Player Me, Mixamo, VRM, etc.)
     * @param {{eyeHeight?:number, hideHead?:boolean, allowFallback?:boolean}} [options]
     */
    constructor(club, container, options = {}) {
        this.club = club;
        this.scene = club.scene;
        this.ok = false;
        this.disposed = false;
        this.hideHead = !!options.hideHead;
        this.rigMode = 'full';
        this.rootYOffset = 0;

        const prefix = `rig${AvatarRig._seq++}`;
        // The crowd's materials, shared: they are already compiled and ready. Giving each
        // body its own copy was measured and rejected: three copies compiled 38 new shader
        // effects and left the guests invisible for ~3 s. (Cloning through the loader is
        // worse still: it clones the textures, which never become ready.)
        const entry = container.instantiateModelsToScene(
            name => `${prefix}_${name}`,
            false,
            { doNotInstantiate: true }
        );
        this.entry = entry;
        const root = entry.rootNodes[0];
        if (!root) { this.dispose(); return; }
        this.root = root;
        root.rotationQuaternion = null;
        root.rotation.set(0, 0, 0);

        // --- bones by name or standard humanoid alias ------------------------------
        const strip = `${prefix}_`;
        const hierarchy = root.getChildTransformNodes(false);
        const allowCustom = !!(options.allowCustomSkeleton || options.allowFallback);
        const resolved = AvatarRig._resolveBoneNodes(root, strip, hierarchy, allowCustom);
        if (!resolved) {
            if (!options.allowFallback) {
                entry.animationGroups.forEach(group => { group.stop(); group.dispose(); });
                this.dispose();
                return;
            }
            this._initRigidFallback(options.eyeHeight || 1.7);
            return;
        }
        // Procedural only. An un-started clip would still be a live animation group.
        entry.animationGroups.forEach(group => { group.stop(); group.dispose(); });
        const nodes = resolved.nodes;
        this.rigMode = resolved.rigMode;
        this._synthNodes = resolved.synthNodes;
        this.bone = nodes;
        for (const name of AvatarRig.BONES) {
            if (!nodes[name]) { this.dispose(); return; }
            if (!nodes[name].rotationQuaternion) {
                nodes[name].rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
                    nodes[name].rotation.x, nodes[name].rotation.y, nodes[name].rotation.z);
            }
        }

        // --- topological order of every node we touch or measure -----------------
        const needed = new Set();
        for (const name of AvatarRig.BONES) {
            for (let n = nodes[name]; n && n !== root; n = n.parent) needed.add(n);
        }
        // Babylon returns a parent-before-child hierarchy walk. Filtering that one walk is
        // enough; sorting every node by repeatedly walking its ancestors was quadratic.
        this.order = hierarchy.filter(node => needed.has(node));
        this.order.forEach(node => {
            if (!node.rotationQuaternion) {
                node.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(
                    node.rotation.x, node.rotation.y, node.rotation.z);
            }
        });
        this.index = new Map();
        this.order.forEach((n, i) => this.index.set(n, i));
        this.ix = {};
        for (const name of AvatarRig.BONES) this.ix[name] = this.index.get(nodes[name]);

        // --- scratch (no per-frame allocation) -------------------------------------
        this._initPoseScratch();
        const V = BABYLON.Vector3;
        this.F = new V(0, 0, 1);
        this.R = new V(1, 0, 0);
        this.U = new V(0, 1, 0);
        this._buildCache();

        this.meshes = root.getChildMeshes(false);
        this.meshes.forEach(mesh => {
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true;   // skinned bind-pose bounds cull wrongly
            mesh.renderingGroupId = 0;
        });
        const matchedHead = this.meshes.filter(mesh => AvatarRig.HEAD_MESH.test(mesh.name));
        this.headMeshes = (matchedHead.length > 0 && matchedHead.length < this.meshes.length) ? matchedHead : [];
        this._headVisible = true;
        if (this.hideHead) {
            this.setHeadVisible(false);
        }
        if (club._prepareAvatarMaterials) {
            club._prepareAvatarMaterials(Array.from(new Set(this.meshes.map(m => m.material).filter(Boolean))), null);
        }

        // --- locomotion state -------------------------------------------------------
        this.bodyYaw = 0;
        this.turning = false;
        this.phase = 0;
        this.speed = 0;            // smoothed ground speed, m/s
        this.vF = 0; this.vR = 0;  // smoothed velocity in the body frame
        this.walkW = 0;            // 0 standing .. 1 walking, smoothed
        this.time = 0;
        this._prevX = NaN; this._prevZ = NaN;
        this._placed = false;

        this._measure(options.eyeHeight || 1.7);
        this._measureHeadphones();
        this.ok = true;
    }

    _initRigidFallback(eyeHeight) {
        const root = this.root;
        this.rigMode = 'rigid';
        this.order = [];
        this.ix = {};
        this.bone = {};
        this._initPoseScratch();
        const V = BABYLON.Vector3;
        this.F = new V(0, 0, 1);
        this.R = new V(1, 0, 0);
        this.U = new V(0, 1, 0);
        this.meshes = root.getChildMeshes(false);
        this.meshes.forEach(mesh => {
            mesh.isPickable = false;
            mesh.alwaysSelectAsActiveMesh = true;
            mesh.renderingGroupId = 0;
        });
        this.headMeshes = [];
        this._headVisible = true;
        if (this.club._prepareAvatarMaterials) {
            this.club._prepareAvatarMaterials(Array.from(new Set(this.meshes.map(m => m.material).filter(Boolean))), null);
        }
        root.scaling.setAll(1);
        root.position.set(0, 0, 0);
        root.computeWorldMatrix(true);
        const bounds = root.getHierarchyBoundingVectors(true);
        const rawH = Math.max(0.1, bounds.max.y - bounds.min.y);
        const scale = (eyeHeight / 0.935) / rawH;
        root.scaling.setAll(scale);
        root.computeWorldMatrix(true);
        const scaledBounds = root.getHierarchyBoundingVectors(true);
        this.rootYOffset = -scaledBounds.min.y;
        root.position.y = this.rootYOffset;
        this.scaleK = scale;
        this.standEye = eyeHeight;
        this.pelvisF = 0;
        this.pelvisR = 0;
        this.pelvisH = eyeHeight * 0.56;
        this.yaw0 = 0;
        this.yawDir = 1;
        this.sideL = 1;
        this.bodyYaw = 0;
        this.phase = 0;
        this.speed = 0;
        this.walkW = 0;
        this.time = 0;
        this._prevX = NaN;
        this._prevZ = NaN;
        this._placed = false;
        if (this.entry && this.entry.animationGroups && this.entry.animationGroups.length > 0) {
            this.entry.animationGroups[0].start(true);
            for (let i = 1; i < this.entry.animationGroups.length; i++) {
                this.entry.animationGroups[i].stop();
                this.entry.animationGroups[i].dispose();
            }
        }
        this.ok = true;
    }

    /** Cup outer faces in the Head bone's bind frame, not an eye-height offset shared by unlike heads. */
    _measureHeadphones() {
        this._headphoneCups = null;
        const B = BABYLON, V = B.Vector3;
        const mesh = this.meshes.find(m => /Headphones/.test(m.name) && m.skeleton);
        if (!mesh) return;
        const head = mesh.skeleton.bones.find(b => /(?:^|_)Head$/.test(b.name));
        const positions = mesh.getVerticesData(B.VertexBuffer.PositionKind);
        if (!head || !positions) return;
        let minX = Infinity, maxX = -Infinity;
        for (let i = 0; i < positions.length; i += 3) {
            minX = Math.min(minX, positions[i]); maxX = Math.max(maxX, positions[i]);
        }
        const inverseBind = head.getAbsoluteInverseBindMatrix();
        const headWorld = this.bone.Head.getWorldMatrix(), inverseHead = headWorld.clone().invert();
        const right = new V(Math.cos(this.yaw0), 0, -Math.sin(this.yaw0));
        const forward = new V(Math.sin(this.yaw0), 0, Math.cos(this.yaw0));
        const cups = [];
        for (const sign of [-1, 1]) {
            const edge = sign < 0 ? minX : maxX;
            const centreX = (minX + maxX) * 0.5;
            const min = new V(Infinity, Infinity, Infinity), max = new V(-Infinity, -Infinity, -Infinity);
            // The outer tenth of this rigid headphone mesh contains the cup shell, not the crown band.
            for (let i = 0; i < positions.length; i += 3) {
                if ((positions[i] - centreX) * sign < (edge - centreX) * sign * 0.9) continue;
                min.minimizeInPlaceFromFloats(positions[i], positions[i + 1], positions[i + 2]);
                max.maximizeInPlaceFromFloats(positions[i], positions[i + 1], positions[i + 2]);
            }
            const point = new V(edge, (min.y + max.y) * 0.5, (min.z + max.z) * 0.5);
            V.TransformCoordinatesToRef(point, inverseBind, point);
            const world = V.TransformCoordinates(point, headWorld);
            const side = V.Dot(world.subtract(this.bone.Head.getAbsolutePosition()), right) < 0 ? 0 : 1;
            const suffix = (side === 0) === (this.sideL < 0) ? 'l' : 'r';
            const wrist = this.bone[`hand_${suffix}`].getAbsolutePosition();
            const knuckles = this.bone[`index_01_${suffix}`].getAbsolutePosition().add(this.bone[`pinky_01_${suffix}`].getAbsolutePosition()).scaleInPlace(0.5);
            cups[side] = { point, palmLength: V.Distance(wrist, knuckles) * 0.5 / this.scaleK,
                up: V.TransformNormal(new V(0, 1, 0), inverseHead).normalize(),
                thumb: V.TransformNormal(forward.scale(side === 0 ? -1 : 1), inverseHead).normalize() };
        }
        this._headphoneCups = cups;
        this._headphoneHand = {};
        this._headphonePoint = new V();
        this._headphoneUp = new V();
        this._headphoneThumb = new V();
    }

    _initPoseScratch() {
        const V = BABYLON.Vector3, M = BABYLON.Matrix, Q = BABYLON.Quaternion;
        this._v = Array.from({ length: 10 }, () => new V());
        this._m = Array.from({ length: 6 }, () => new M());
        this._q = new Q(); this._q2 = new Q();
        this._scaleOut = new V(); this._tOut = new V();
    }

    /** An arm-only view of an existing modular character; it owns no meshes, materials or animations. */
    static createTrackedArms(root, prefix) {
        const rig = Object.create(AvatarRig.prototype);
        const nodes = {};
        const hierarchy = root.getChildTransformNodes(false);
        hierarchy.forEach(node => {
            if (node.name.startsWith(prefix)) nodes[node.name.slice(prefix.length)] = node;
        });
        const names = {};
        for (const [suffix, side] of [['l', 'L'], ['r', 'R']]) {
            names[`upperarm_${suffix}`] = `UpperArm.${side}`;
            names[`lowerarm_${suffix}`] = `LowerArm.${side}`;
            names[`hand_${suffix}`] = `Wrist.${side}`;
            names[`index_01_${suffix}`] = `Index1.${side}`;
            names[`pinky_01_${suffix}`] = `Pinky1.${side}`;
        }
        const needed = new Set();
        for (const name of Object.values(names)) {
            if (!nodes[name]) return null;
            for (let node = nodes[name]; node && node !== root; node = node.parent) needed.add(node);
        }
        rig.order = hierarchy.filter(node => needed.has(node));
        rig.index = new Map(rig.order.map((node, i) => [node, i]));
        rig.ix = {};
        for (const [key, name] of Object.entries(names)) rig.ix[key] = rig.index.get(nodes[name]);
        rig.order.forEach(node => {
            if (!node.rotationQuaternion) node.rotationQuaternion = BABYLON.Quaternion.FromEulerAngles(node.rotation.x, node.rotation.y, node.rotation.z);
        });
        rig.root = root;
        rig._initPoseScratch();
        rig._buildCache();
        const yaw = root.parent.rotation.y;
        const left = rig.pos[rig.ix.upperarm_l], right = rig.pos[rig.ix.upperarm_r];
        // Removing the glTF root conversion mirrors bone names; choose physical sides in the guest's facing frame.
        const namedLeftIsLeft = (left.x - right.x) * Math.cos(yaw) - (left.z - right.z) * Math.sin(yaw) < 0;
        rig.arms = ['l', 'r'].map(suffix => ({
            suffix, side: (suffix === 'l') === namedLeftIsLeft ? 'left' : 'right',
            upper: rig.ix[`upperarm_${suffix}`], lower: rig.ix[`lowerarm_${suffix}`], hand: rig.ix[`hand_${suffix}`],
            otherUpper: rig.ix[`upperarm_${suffix === 'l' ? 'r' : 'l'}`],
            indices: [rig.ix[`upperarm_${suffix}`], rig.ix[`lowerarm_${suffix}`], rig.ix[`hand_${suffix}`]]
        }));
        rig._handWorld = {};
        return rig;
    }

    /** Run after clip evaluation, reading the animated torso before overriding only tracked arms. */
    updateTrackedArms(hands, yaw, eyeHeight) {
        for (const node of this._extNodes) node.computeWorldMatrix(true);
        for (let i = 0; i < this.order.length; i++) {
            const node = this.order[i];
            this.Lt[i].copyFrom(node.position);
            this.Ls[i].copyFrom(node.scaling);
            this.Lq[i].copyFrom(node.rotationQuaternion);
        }
        this._refreshCache();
        const fx = Math.sin(yaw), fz = Math.cos(yaw);
        for (const arm of this.arms) {
            const relative = hands[arm.side];
            if (!relative) continue;
            const hand = this._handWorld;
            hand.fx = relative.fx; hand.fy = relative.fy; hand.fz = relative.fz;
            hand.ux = relative.ux; hand.uy = relative.uy; hand.uz = relative.uz;
            const rootPosition = this.root.parent.position;
            hand.x = rootPosition.x + relative.x;
            hand.y = rootPosition.y + eyeHeight + relative.y;
            hand.z = rootPosition.z + relative.z;
            const shoulder = this.pos[arm.upper], other = this.pos[arm.otherUpper];
            const dx = shoulder.x - other.x, dz = shoulder.z - other.z;
            const width = Math.hypot(dx, dz) || 1;
            this._limb(arm.upper, arm.lower, arm.hand, this._v[4].set(hand.x, hand.y, hand.z),
                -fx * 0.7 + dx / width * 0.7, -0.35, -fz * 0.7 + dz / width * 0.7);
            this._poseHand(arm.hand, arm.suffix, hand);
            for (const index of arm.indices) this.order[index].rotationQuaternion.copyFrom(this.Lq[index]);
        }
    }

    // ───────────────────────── measurement (once) ─────────────────────────

    static shortestAngle(from, to) {
        const tau = Math.PI * 2;
        return (to - from) - tau * Math.round((to - from) / tau);
    }

    /** Recompute world matrices for every node we drive, from `from` down. */
    _refresh(from = 0) {
        for (let i = from; i < this.order.length; i++) this.order[i].computeWorldMatrix(true);
    }

    _refreshAll() {
        this.root.computeWorldMatrix(true);
        this._refresh(0);
    }

    _yawOf(a, b, out) {
        // Horizontal heading of the vector a->b as a yaw (F = (sin, 0, cos)).
        b.subtractToRef(a, out);
        return Math.atan2(out.x, out.z);
    }

    _measure(eyeHeight) {
        const b = this.bone, root = this.root, v = this._v;
        const head = b.Head;
        // Calibration measures the bind facing, never the player's current turn.
        root.rotation.set(0, 0, 0);
        const lowestY = bounds => {
            if (this.rigMode === 'upper-body') {
                return Math.min(
                    bounds.min.y,
                    b.foot_l.getAbsolutePosition().y,
                    b.foot_r.getAbsolutePosition().y,
                    b.ball_l.getAbsolutePosition().y,
                    b.ball_r.getAbsolutePosition().y
                );
            }
            return bounds.min.y;
        };
        const plant = () => {
            this._refreshAll();
            const bounds = root.getHierarchyBoundingVectors(true);
            root.position.y -= lowestY(bounds);
            this._refreshAll();
        };

        // Size so the eye sits at the player's eye height, feet on y = 0.
        root.scaling.setAll(1);
        root.position.set(0, 0, 0);
        this._refreshAll();
        const raw = root.getHierarchyBoundingVectors(true);
        const rawMinY = lowestY(raw);
        root.scaling.setAll(1.78 / Math.max(1e-6, raw.max.y - rawMinY));
        plant();
        // Eyes sit ~5% of the head-bone height above it; scale so they land on eyeHeight.
        root.scaling.scaleInPlace(eyeHeight / Math.max(0.2, head.getAbsolutePosition().y * 1.052));
        plant();
        this.rootYOffset = this.rigMode === 'upper-body' ? root.position.y : 0;
        this.scaleK = root.scaling.x;
        this.standEye = eyeHeight;
        this.eyeAbove = head.getAbsolutePosition().y * 0.052;

        // Facing and handedness, measured rather than assumed.
        const yaw0 = this._yawOf(b.foot_l.getAbsolutePosition(), b.ball_l.getAbsolutePosition(), v[0]);
        this.yaw0 = yaw0;
        root.rotation.y = 0.4;
        this._refreshAll();
        const yaw1 = this._yawOf(b.foot_l.getAbsolutePosition(), b.ball_l.getAbsolutePosition(), v[0]);
        this.yawDir = AvatarRig.shortestAngle(yaw0, yaw1) >= 0 ? 1 : -1;
        root.rotation.y = 0;
        this._refreshAll();

        const sin = Math.sin(yaw0), cos = Math.cos(yaw0);
        const F0 = v[1].set(sin, 0, cos), R0 = v[2].set(cos, 0, -sin);
        const tl = b.thigh_l.getAbsolutePosition(), tr = b.thigh_r.getAbsolutePosition();
        v[3].set(tl.x - tr.x, 0, tl.z - tr.z);
        this.sideL = BABYLON.Vector3.Dot(v[3], R0) >= 0 ? 1 : -1;   // +1: the left leg is on the +R side

        const fl = b.foot_l.getAbsolutePosition(), fr = b.foot_r.getAbsolutePosition();
        v[3].set(fl.x - fr.x, 0, fl.z - fr.z);
        this.footHalfWidth = Math.abs(BABYLON.Vector3.Dot(v[3], R0)) * 0.5;
        this.ankleH = (fl.y + fr.y) * 0.5;               // the floor is y = 0 after plant()
        v[3].set(b.ball_l.getAbsolutePosition().x - fl.x, b.ball_l.getAbsolutePosition().y - fl.y, b.ball_l.getAbsolutePosition().z - fl.z);
        this.restBallPitch = Math.asin(Math.max(-1, Math.min(1, v[3].y / Math.max(1e-6, v[3].length()))));

        // Where the pelvis sits relative to the model root, in the body frame.
        const pel = b.pelvis.getAbsolutePosition(), rp = root.getAbsolutePosition();
        v[3].set(pel.x - rp.x, 0, pel.z - rp.z);
        this.pelvisF = BABYLON.Vector3.Dot(v[3], F0);
        this.pelvisR = BABYLON.Vector3.Dot(v[3], R0);
        this.pelvisH = pel.y;                       // standing pelvis height above the floor
        this.floorY = 0;
    }

    // ───────────────────────── own world-matrix cache ─────────────────────────
    //
    // Babylon's computeWorldMatrix() is far too heavy to call ~3,000 times a frame. The
    // rig owns every number it needs (bone local translation/scale never change, only
    // rotations do), so it keeps its own composed matrices and positions for the ~28 nodes
    // it touches and hands the final quaternions back to the nodes once per frame.

    _buildCache() {
        const n = this.order.length, V = BABYLON.Vector3, M = BABYLON.Matrix;
        this.par = new Int16Array(n);
        this.ext = new Array(n);
        this.Lt = new Array(n); this.Ls = new Array(n); this.Lq = new Array(n); this.restQ = new Array(n);
        this.W = new Array(n); this.pos = new Array(n); this.children = new Array(n);
        this._limbL1 = new Float64Array(n); this._limbL2 = new Float64Array(n);
        for (let i = 0; i < n; i++) this.children[i] = [];
        this.order.forEach((node, i) => {
            const p = this.index.has(node.parent) ? this.index.get(node.parent) : -1;
            this.par[i] = p;
            if (p >= 0) this.children[p].push(i);
            this.ext[i] = p < 0 ? node.parent : null;
            this.Lt[i] = node.position.clone();
            this.Ls[i] = node.scaling.clone();
            this.restQ[i] = node.rotationQuaternion.clone();
            this.Lq[i] = node.rotationQuaternion.clone();
            this.W[i] = new M();
            this.pos[i] = new V();
        });
        this._extNodes = Array.from(new Set(this.ext.filter(Boolean)));
    }

    _updateNode(i) {
        const L = this._m[5];
        BABYLON.Matrix.ComposeToRef(this.Ls[i], this.Lq[i], this.Lt[i], L);
        const p = this.par[i];
        L.multiplyToRef(p >= 0 ? this.W[p] : this.ext[i].getWorldMatrix(), this.W[i]);
        const m = this.W[i].m;
        this.pos[i].set(m[12], m[13], m[14]);
    }

    /** Recompute node `i` and everything below it. */
    _refreshFrom(i) {
        this._updateNode(i);
        const children = this.children[i];
        for (let k = 0; k < children.length; k++) this._refreshFrom(children[k]);
    }

    _refreshCache() {
        for (let i = 0; i < this.order.length; i++) this._updateNode(i);
    }

    // ───────────────────────── pose primitives ─────────────────────────

    /**
     * Rotate node `i` about its own origin by `dq`, a rotation of WORLD vectors, and
     * re-derive its local quaternion through the parent's world matrix. Works for any
     * bone axis convention and through a mirrored root.
     */
    _rotateWorld(i, dq) {
        const m = this._m, w = this.W[i];
        const tx = w.m[12], ty = w.m[13], tz = w.m[14];
        m[0].copyFrom(w);
        m[0].setTranslationFromFloats(0, 0, 0);
        dq.toRotationMatrix(m[1]);
        m[0].multiplyToRef(m[1], m[2]);                // orientation, then the world rotation
        m[2].setTranslationFromFloats(tx, ty, tz);
        const p = this.par[i];
        (p >= 0 ? this.W[p] : this.ext[i].getWorldMatrix()).invertToRef(m[3]);
        m[2].multiplyToRef(m[3], m[4]);                // local = world * inverse(parentWorld)
        m[4].decompose(this._scaleOut, this._q, this._tOut);
        this.Lq[i].copyFrom(this._q);
        this._refreshFrom(i);
    }

    /** Rotate node `i` so the world direction `from` (unit) becomes `to` (unit). */
    _rotateFromTo(i, from, to) {
        BABYLON.Quaternion.FromUnitVectorsToRef(from, to, this._q2);
        this._rotateWorld(i, this._q2);
    }

    /** Point the bone `i` -> `child` along the world direction `dir` (unit). */
    _aim(i, child, dir) {
        const c = this._v[8];
        this.pos[child].subtractToRef(this.pos[i], c);
        const len = c.length();
        if (len < 1e-6) return;
        c.scaleInPlace(1 / len);
        this._rotateFromTo(i, c, dir);
    }

    /** Rotate node `i` about the unit `axis` so `from` swings onto `to` (projected perpendicular to it). */
    _alignAbout(i, axis, from, to) {
        const a = this._v[8], b = this._v[9];
        const df = BABYLON.Vector3.Dot(from, axis), dt = BABYLON.Vector3.Dot(to, axis);
        a.set(from.x - axis.x * df, from.y - axis.y * df, from.z - axis.z * df);
        b.set(to.x - axis.x * dt, to.y - axis.y * dt, to.z - axis.z * dt);
        const la = a.length(), lb = b.length();
        if (la < 1e-4 || lb < 1e-4) return;
        a.scaleInPlace(1 / la); b.scaleInPlace(1 / lb);
        this._rotateFromTo(i, a, b);
    }

    /**
     * Two-bone IK: put `end` on `target` with the middle joint bent toward the world
     * direction (poleX, poleY, poleZ). Reach is clamped, so an out-of-range target
     * straightens the limb instead of stretching it.
     */
    _reach(upper, mid, end) {
        let l1 = this._limbL1[upper], l2 = this._limbL2[upper];
        if (!(l1 > 0 && l2 > 0)) {
            const S = this.pos[upper], E = this.pos[mid], H = this.pos[end];
            l1 = this._limbL1[upper] = Math.hypot(S.x - E.x, S.y - E.y, S.z - E.z);
            l2 = this._limbL2[upper] = Math.hypot(E.x - H.x, E.y - H.y, E.z - H.z);
        }
        return l1 + l2;
    }

    _limb(upper, mid, end, target, poleX, poleY, poleZ) {
        const v = this._v;
        const S = this.pos[upper];
        this._reach(upper, mid, end);
        const l1 = this._limbL1[upper], l2 = this._limbL2[upper];
        const dir = v[0];
        target.subtractToRef(S, dir);
        const dist = dir.length();
        if (dist < 1e-5) return;
        dir.scaleInPlace(1 / dist);
        const d = Math.min(Math.max(dist, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
        const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
        const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
        const ortho = v[1];
        const pd = poleX * dir.x + poleY * dir.y + poleZ * dir.z;
        ortho.set(poleX - dir.x * pd, poleY - dir.y * pd, poleZ - dir.z * pd);
        if (ortho.lengthSquared() < 1e-8) ortho.set(0, 0, 1);
        ortho.normalize();
        const eDir = v[2];
        eDir.set(dir.x * a + ortho.x * h, dir.y * a + ortho.y * h, dir.z * a + ortho.z * h);
        eDir.normalize();
        const sx = S.x, sy = S.y, sz = S.z;
        this._aim(upper, mid, eDir);
        const lower = v[3];
        lower.set(sx + dir.x * d - this.pos[mid].x, sy + dir.y * d - this.pos[mid].y, sz + dir.z * d - this.pos[mid].z);
        const ll = lower.length();
        if (ll < 1e-6) return;
        lower.scaleInPlace(1 / ll);
        this._aim(mid, end, lower);
    }


    // ───────────────────────── per-frame pose ─────────────────────────

    /** Rotate about the vertical so the body-forward direction swings toward +R by `ang`. */
    _yawBy(i, ang) {
        if (Math.abs(ang) < 1e-5) return;
        const c = Math.cos(ang), s = Math.sin(ang), t = this._v[5];
        t.set(this.F.x * c + this.R.x * s, 0, this.F.z * c + this.R.z * s);
        this._rotateFromTo(i, this.F, t);
    }

    /**
     * Tilt the part above node `i` so its top moves toward the horizontal direction
     * (fx, fz) by `ang` (positive = forward/down, negative = back/up).
     */
    _tiltBy(i, ang, fx, fz) {
        if (Math.abs(ang) < 1e-5) return;
        const c = Math.cos(ang), s = Math.sin(ang), t = this._v[5];
        t.set(fx * s, c, fz * s);
        this._rotateFromTo(i, this.U, t);
    }

    /**
     * Pose the skeleton for one frame.
     * @param {number} dt seconds
     * @param {{x:number,z:number,groundY:number,eyeY:number,headYaw:number,headPitch:number,
     *   bodyYaw?:number,seated?:boolean,seatY?:number,
     *   left?:object|null,right?:object|null}} pose  headPitch > 0 looks up. Hands carry a
     *   world position (x,y,z), forward (fx,fy,fz) and up (ux,uy,uz); null = relaxed arm.
     */
    update(dt, pose) {
        if (!this.ok || this.disposed || !pose) return;
        dt = Math.min(0.1, Math.max(1e-4, dt));
        this.time += dt;
        const ix = this.ix, root = this.root, v = this._v;
        const num = (n, d) => (Number.isFinite(n) ? n : d);
        const px = num(pose.x, 0), pz = num(pose.z, 0);
        const ground = num(pose.groundY, 0);
        const eyeY = num(pose.eyeY, ground + this.standEye);
        const headYaw = num(pose.headYaw, 0);
        const seated = pose.seated === true;
        const facingYaw = num(pose.bodyYaw, headYaw);

        // --- velocity, from where the player actually moved ------------------------
        let wvx = 0, wvz = 0;
        if (this._placed && !seated) {
            wvx = (px - this._prevX) / dt;
            wvz = (pz - this._prevZ) / dt;
            if (wvx * wvx + wvz * wvz > 144) { wvx = 0; wvz = 0; }     // a teleport is not a sprint
        } else {
            this.bodyYaw = facingYaw;
            this._placed = true;
        }
        this._prevX = px; this._prevZ = pz;

        // --- body yaw: hips follow the eyes with a dead-zone -----------------------
        const off = AvatarRig.shortestAngle(this.bodyYaw, facingYaw);
        if (seated) {
            this.bodyYaw = facingYaw;
            this.turning = false;
        } else if (this.speed > 0.3) {
            this.turning = false;
            this.bodyYaw += off * (1 - Math.exp(-6 * dt));
        } else {
            if (!this.turning && Math.abs(off) > 0.9) this.turning = true;
            if (this.turning) {
                this.bodyYaw += Math.max(-3.5 * dt, Math.min(3.5 * dt, off));
                if (Math.abs(off) < 0.2) this.turning = false;
            }
        }
        const sinY = Math.sin(this.bodyYaw), cosY = Math.cos(this.bodyYaw);
        const F = this.F.set(sinY, 0, cosY), R = this.R.set(cosY, 0, -sinY);

        const kv = 1 - Math.exp(-10 * dt);
        this.vF += ((wvx * F.x + wvz * F.z) - this.vF) * kv;
        this.vR += ((wvx * R.x + wvz * R.z) - this.vR) * kv;
        this.speed = Math.hypot(this.vF, this.vR);
        if (seated) {
            this.vF = 0;
            this.vR = 0;
            this.speed = 0;
        }
        const mF = this.speed > 1e-3 ? this.vF / this.speed : 1;
        const mR = this.speed > 1e-3 ? this.vR / this.speed : 0;
        this.walkW += ((this.speed > 0.15 ? 1 : 0) - this.walkW) * (1 - Math.exp(-8 * dt));
        if (seated) this.walkW = 0;
        const sp = Math.min(this.speed, 7);
        const L = Math.max(0.35, Math.min(0.95, 0.40 + 0.20 * sp));         // step length, m
        this.phase = (this.phase + this.speed * dt / (2 * L)) % 1;
        const walkW = this.walkW;

        // --- root placement ---------------------------------------------------------
        const bodyFloor = eyeY - this.standEye;                              // where the feet would be
        const feetFloor = bodyFloor - ground > 0.12 ? bodyFloor : ground;    // airborne: feet trail the body
        const bob = -0.022 * walkW * Math.cos(this.phase * 4 * Math.PI);
        // The torso sits behind the eyes, and further back the more the head tips down:
        // the body mesh is open at the neck, so looking down from directly above it would
        // show the inside of the shoulders. Backing off puts the camera in front of the
        // chest instead, the way first-person bodies do.
        const down = Math.max(0, -num(pose.headPitch, 0));
        const back = 0.06 + 0.13 * Math.min(1, down / 1.0);
        const cx = px - F.x * back, cz = pz - F.z * back;
        root.rotation.y = (this.bodyYaw - this.yaw0) * this.yawDir;
        const rootY = (seated ? num(pose.seatY, ground + 0.48) - this.pelvisH : Math.max(ground - 0.7, bodyFloor) + bob) + (this.rootYOffset || 0);
        root.position.set(
            cx - (F.x * this.pelvisF + R.x * this.pelvisR),
            rootY,
            cz - (F.z * this.pelvisF + R.z * this.pelvisR)
        );
        root.computeWorldMatrix(true);
        if (this.rigMode === 'rigid') return;
        for (let i = 0; i < this._extNodes.length; i++) this._extNodes[i].computeWorldMatrix(true);
        for (let i = 0; i < this.order.length; i++) this.Lq[i].copyFrom(this.restQ[i]);
        this._refreshCache();

        // --- torso: counter-twist, lean, breath ---------------------------------------
        const tw = walkW * Math.sin(this.phase * 2 * Math.PI);
        const lean = Math.min(0.12, 0.02 + 0.012 * sp) * walkW + 0.01;
        const breath = 0.012 * Math.sin(this.time * 1.7);
        // An optional extra forward bend (radians), spread over the spine: a DJ leaning over the decks.
        const bend = Math.max(0, Math.min(0.6, num(pose.lean, 0) + (seated ? 0.08 : 0)));
        this._yawBy(ix.pelvis, -0.08 * tw);
        this._tiltBy(ix.spine_01, lean * 0.45 + bend * 0.4, F.x, F.z);
        this._yawBy(ix.spine_01, 0.06 * tw);
        this._tiltBy(ix.spine_02, lean * 0.30 + breath + bend * 0.35, F.x, F.z);
        this._yawBy(ix.spine_02, 0.06 * tw);

        // --- head: the twist the hips did not take, split over spine, neck and head ----
        const yawLeft = Math.max(-1.45, Math.min(1.45, AvatarRig.shortestAngle(this.bodyYaw, headYaw) - 0.10 * tw));
        const pitch = Math.max(-0.9, Math.min(0.9, num(pose.headPitch, 0)));
        this._yawBy(ix.spine_03, 0.06 * tw + 0.2 * yawLeft);
        const sy = Math.sin(this.bodyYaw + 0.2 * yawLeft), cy = Math.cos(this.bodyYaw + 0.2 * yawLeft);
        this._tiltBy(ix.spine_03, lean * 0.25 + bend * 0.25 - pitch * 0.15, sy, cy);
        this._yawBy(ix.neck_01, 0.3 * yawLeft);
        const hfx = Math.sin(headYaw), hfz = Math.cos(headYaw);
        this._tiltBy(ix.neck_01, -pitch * 0.35, hfx, hfz);
        this._yawBy(ix.Head, 0.5 * yawLeft);
        this._tiltBy(ix.Head, -pitch * 0.5, hfx, hfz);

        // --- legs: planted stance feet, stepping swing feet, IK to the ankles ----------
        const hip = this.footHalfWidth;
        const swingH = Math.min(0.14, 0.06 + 0.012 * sp);
        const legs = this._legs || (this._legs = [{ psi: 0, u: 0 }, { psi: 0.5, u: 0 }]);
        legs[0].thigh = ix.thigh_l; legs[0].calf = ix.calf_l; legs[0].foot = ix.foot_l; legs[0].ball = ix.ball_l; legs[0].side = this.sideL;
        legs[1].thigh = ix.thigh_r; legs[1].calf = ix.calf_r; legs[1].foot = ix.foot_r; legs[1].ball = ix.ball_r; legs[1].side = -this.sideL;
        for (let i = 0; i < 2; i++) {
            const leg = legs[i];
            if (seated) {
                leg.u = 0;
                const t = v[4];
                t.set(
                    cx + F.x * 0.38 + R.x * leg.side * hip,
                    ground + this.ankleH,
                    cz + F.z * 0.38 + R.z * leg.side * hip
                );
                this._limb(leg.thigh, leg.calf, leg.foot, t, F.x + R.x * leg.side * 0.15, 0.2, F.z + R.z * leg.side * 0.15);
                v[6].set(F.x * Math.cos(this.restBallPitch), Math.sin(this.restBallPitch), F.z * Math.cos(this.restBallPitch));
                this._aim(leg.foot, leg.ball, v[6]);
                continue;
            }
            const psi = (this.phase + leg.psi) % 1;
            let u, lift = 0, toe = 0;
            if (psi < 0.6) {
                u = 0.6 * L - 2 * L * psi;
                if (psi > 0.45) { const k = (psi - 0.45) / 0.15; toe = -0.5 * k * k * (3 - 2 * k); }  // heel lifts
            } else {
                const s = (psi - 0.6) / 0.4, e = s * s * (3 - 2 * s);
                u = -0.6 * L + 1.2 * L * e;
                lift = swingH * Math.sin(Math.PI * s);
                toe = (2 * s - 1) * 0.35;
            }
            leg.u = u;
            const f = mF * u * walkW, r = mR * u * walkW;
            const t = v[4];
            t.set(
                cx + F.x * f + R.x * (leg.side * hip + r),
                feetFloor + this.ankleH + lift * walkW,
                cz + F.z * f + R.z * (leg.side * hip + r)
            );
            this._limb(leg.thigh, leg.calf, leg.foot, t, F.x + R.x * leg.side * 0.2, 0, F.z + R.z * leg.side * 0.2);
            const p = this.restBallPitch + toe * walkW;
            v[6].set(F.x * Math.cos(p), Math.sin(p), F.z * Math.cos(p));
            this._aim(leg.foot, leg.ball, v[6]);
        }

        // --- arms: physical left/right, each against the opposite leg -------------------
        for (let a = 0; a < 2; a++) {
            const sideSign = a === 0 ? -1 : 1;                               // -R is the player's left
            const sfx = (a === 0) === (this.sideL < 0) ? 'l' : 'r';
            const opp = legs[(a === 0) === (this.sideL < 0) ? 1 : 0].u;
            const upper = ix[`upperarm_${sfx}`], lower = ix[`lowerarm_${sfx}`], hand = ix[`hand_${sfx}`];
            const sh = this.pos[upper];
            const reach = this._reach(upper, lower, hand);
            const t = v[4];
            let h = a === 0 ? pose.left : pose.right;
            if (h && Number.isFinite(h.x)) {
                t.set(h.x - h.fx * 0.05, h.y - h.fy * 0.05, h.z - h.fz * 0.05);   // wrist sits behind the palm
                const cup = this._headphoneCups && this._headphoneCups[a];
                if (cup && h.headphone > 0) {
                    const weight = Math.min(1, h.headphone), matrix = this.W[ix.Head];
                    const point = this._headphonePoint, up = this._headphoneUp, thumb = this._headphoneThumb;
                    BABYLON.Vector3.TransformCoordinatesToRef(cup.point, matrix, point);
                    BABYLON.Vector3.TransformNormalToRef(cup.up, matrix, up); up.normalize();
                    BABYLON.Vector3.TransformNormalToRef(cup.thumb, matrix, thumb); thumb.normalize();
                    const palmLength = cup.palmLength * this.scaleK;
                    t.x += (point.x - up.x * palmLength - t.x) * weight;
                    t.y += (point.y - up.y * palmLength - t.y) * weight;
                    t.z += (point.z - up.z * palmLength - t.z) * weight;
                    const contact = this._headphoneHand;
                    contact.fx = h.fx + (up.x - h.fx) * weight;
                    contact.fy = h.fy + (up.y - h.fy) * weight;
                    contact.fz = h.fz + (up.z - h.fz) * weight;
                    contact.ux = h.ux + (thumb.x - h.ux) * weight;
                    contact.uy = h.uy + (thumb.y - h.uy) * weight;
                    contact.uz = h.uz + (thumb.z - h.uz) * weight;
                    h = contact;
                }
                this._limb(upper, lower, hand, t, -F.x * 0.7 + R.x * sideSign * 0.7, -0.15, -F.z * 0.7 + R.z * sideSign * 0.7);
                this._poseHand(hand, sfx, h);
            } else {
                const swing = Math.min(0.42, (0.16 + 0.06 * sp) * (opp / (0.6 * L))) * walkW +
                    0.015 * Math.sin(this.time * 1.3 + sideSign * 2.0);
                const out = sideSign * 0.07;
                const rr = 0.93 * reach;
                const drop = Math.sqrt(Math.max(0.01, rr * rr - swing * swing - out * out));
                t.set(sh.x + F.x * swing + R.x * out, sh.y - drop, sh.z + F.z * swing + R.z * out);
                this._limb(upper, lower, hand, t, -F.x * 0.7 + R.x * sideSign * 0.7, -0.1, -F.z * 0.7 + R.z * sideSign * 0.7);
            }
        }

        // Hand the finished pose back to the real nodes (the skeleton reads these at render).
        for (let i = 0; i < this.order.length; i++) this.order[i].rotationQuaternion.copyFrom(this.Lq[i]);
    }

    /** Orient a hand to a controller: fingers along its forward, thumb side along its up. */
    _poseHand(hand, sfx, h) {
        const ix = this.ix, v = this._v;
        const idx = ix[`index_01_${sfx}`], pky = ix[`pinky_01_${sfx}`];
        const hp = this.pos[hand];
        const fwd = v[6].set(h.fx, h.fy, h.fz);
        const fl = fwd.length();
        if (fl < 1e-4) return;
        fwd.scaleInPlace(1 / fl);
        const fd = v[7].set((this.pos[idx].x + this.pos[pky].x) * 0.5 - hp.x,
            (this.pos[idx].y + this.pos[pky].y) * 0.5 - hp.y,
            (this.pos[idx].z + this.pos[pky].z) * 0.5 - hp.z);
        const fdl = fd.length();
        if (fdl < 1e-5) return;
        fd.scaleInPlace(1 / fdl);
        this._rotateFromTo(hand, fd, fwd);
        // Roll: the pinky->index vector (thumb side) toward the controller's up.
        const k = v[7].set(this.pos[idx].x - this.pos[pky].x, this.pos[idx].y - this.pos[pky].y, this.pos[idx].z - this.pos[pky].z);
        this._alignAbout(hand, fwd, k, v[5].set(h.ux, h.uy, h.uz));
    }

    setVisible(visible) {
        if (this.root) this.root.setEnabled(!!visible);
    }

    setHeadVisible(visible) {
        const next = !!visible;
        if (this._headVisible === next) return;
        this._headVisible = next;
        if (this.headMeshes && this.headMeshes.length > 0) {
            for (let i = 0; i < this.headMeshes.length; i++) {
                this.headMeshes[i].isVisible = next;
            }
        } else if (this.bone && this.bone.Head && this.ix && this.Ls && this.ix.Head !== undefined) {
            const s = next ? 1 : 0.0001;
            const rest = this._headRestScale || (this._headRestScale = this.bone.Head.scaling.clone());
            this.bone.Head.scaling.set(rest.x * s, rest.y * s, rest.z * s);
            this.Ls[this.ix.Head].copyFrom(this.bone.Head.scaling);
            for (const skeleton of this.entry.skeletons) skeleton.prepare(true);
        }
    }

    /** Forget the cached limb lengths: the character was rescaled, so they are measured again on the next pose. */
    invalidateLimbs() {
        if (this._limbL1) this._limbL1.fill(0);
        if (this._limbL2) this._limbL2.fill(0);
    }

    /** Re-fit the body when the active mode's eye-height calibration changes. */
    setEyeHeight(eyeHeight) {
        if (!this.ok || !(eyeHeight > 0.8) || Math.abs(eyeHeight - this.standEye) < 0.04) return;
        if (this.rigMode === 'rigid') {
            this._initRigidFallback(Math.min(2.1, eyeHeight));
            return;
        }
        const yaw = this.root.rotation.y, pos = this.root.position.clone();
        this.order.forEach((n, i) => n.rotationQuaternion.copyFrom(this.restQ[i]));
        this._measure(Math.min(2.1, eyeHeight));
        this._limbL1.fill(0);
        this._limbL2.fill(0);
        this.root.rotation.y = yaw;
        this.root.position.copyFrom(pos);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.ok = false;
        window.CustomAvatarAppearance?.dispose(this);
        if (this._synthNodes) {
            for (let i = 0; i < this._synthNodes.length; i++) {
                try { this._synthNodes[i].dispose(); } catch (_) { /* ignore */ }
            }
            this._synthNodes = null;
        }
        if (this.entry) { try { this.entry.dispose(); } catch (_) { /* already gone with the scene */ } }
        this.entry = null;
    }
}
window.AvatarRig = AvatarRig;