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
 *   - crouching, flying and the DJ riser fall out of the same maths (root height).
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

    /** Meshes that would put a skull, hair or a mask around the player's own camera. */
    static HEAD_MESH = /head|hair|eye|teeth|neck|skull|face|brow|ear|mask|superhero|sphere\.005|plane\.002|cylinder\.002/i;

    /**
     * @param {object} club  the VRClub (scene, _prepareAvatarMaterials)
     * @param {BABYLON.AssetContainer} container a UE-skeleton dancer (female/male/DJ)
     * @param {{eyeHeight?:number, hideHead?:boolean}} [options]
     */
    constructor(club, container, options = {}) {
        this.club = club;
        this.scene = club.scene;
        this.ok = false;
        this.disposed = false;
        this.hideHead = !!options.hideHead;

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
        // Procedural only. An un-started clip would still be a live animation group.
        entry.animationGroups.forEach(group => { group.stop(); group.dispose(); });
        const root = entry.rootNodes[0];
        if (!root) { this.dispose(); return; }
        this.root = root;
        root.rotationQuaternion = null;
        root.rotation.set(0, 0, 0);

        // --- bones by name -----------------------------------------------------------
        const strip = `${prefix}_`;
        const nodes = {};
        root.getChildTransformNodes(false).forEach(node => {
            if (node.name.startsWith(strip)) nodes[node.name.slice(strip.length)] = node;
        });
        this.bone = nodes;
        for (const name of AvatarRig.BONES) {
            if (!nodes[name]) { this.dispose(); return; }   // not a UE-mannequin skeleton
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
        const depth = n => { let d = 0; for (let p = n; p && p !== root; p = p.parent) d++; return d; };
        this.order = Array.from(needed).sort((a, b) => depth(a) - depth(b));
        this.index = new Map();
        this.order.forEach((n, i) => this.index.set(n, i));
        this.ix = {};
        for (const name of AvatarRig.BONES) this.ix[name] = this.index.get(nodes[name]);

        // --- scratch (no per-frame allocation) -------------------------------------
        const V = BABYLON.Vector3, M = BABYLON.Matrix, Q = BABYLON.Quaternion;
        this._v = Array.from({ length: 10 }, () => new V());
        this._m = Array.from({ length: 6 }, () => new M());
        this._q = new Q();
        this._q2 = new Q();
        this._scaleOut = new V();
        this._tOut = new V();
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
        if (this.hideHead) {
            this.meshes.forEach(mesh => {
                if (AvatarRig.HEAD_MESH.test(mesh.name)) mesh.isVisible = false;
            });
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
        this.ok = true;
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
        const plant = () => {
            this._refreshAll();
            const bounds = root.getHierarchyBoundingVectors(true);
            root.position.y -= bounds.min.y;
            this._refreshAll();
        };

        // Size so the eye sits at the player's eye height, feet on y = 0.
        root.scaling.setAll(1);
        root.position.set(0, 0, 0);
        this._refreshAll();
        const raw = root.getHierarchyBoundingVectors(true);
        root.scaling.setAll(1.78 / Math.max(1e-6, raw.max.y - raw.min.y));
        plant();
        // Eyes sit ~5% of the head-bone height above it; scale so they land on eyeHeight.
        root.scaling.scaleInPlace(eyeHeight / (head.getAbsolutePosition().y * 1.052));
        plant();
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
        this.W = new Array(n); this.pos = new Array(n); this.desc = new Array(n);
        this.order.forEach((node, i) => {
            const p = this.index.has(node.parent) ? this.index.get(node.parent) : -1;
            this.par[i] = p;
            this.ext[i] = p < 0 ? node.parent : null;
            this.Lt[i] = node.position.clone();
            this.Ls[i] = node.scaling.clone();
            this.restQ[i] = node.rotationQuaternion.clone();
            this.Lq[i] = node.rotationQuaternion.clone();
            this.W[i] = new M();
            this.pos[i] = new V();
        });
        for (let i = 0; i < n; i++) {
            const list = [];
            for (let j = i + 1; j < n; j++) {
                for (let a = this.par[j]; a >= 0; a = this.par[a]) { if (a === i) { list.push(j); break; } }
            }
            this.desc[i] = list;
        }
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
        const d = this.desc[i];
        for (let k = 0; k < d.length; k++) this._updateNode(d[k]);
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
    _limb(upper, mid, end, target, poleX, poleY, poleZ) {
        const v = this._v;
        const S = this.pos[upper], E = this.pos[mid], H = this.pos[end];
        const l1 = BABYLON.Vector3.Distance(S, E), l2 = BABYLON.Vector3.Distance(E, H);
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

        // --- velocity, from where the player actually moved ------------------------
        let wvx = 0, wvz = 0;
        if (this._placed) {
            wvx = (px - this._prevX) / dt;
            wvz = (pz - this._prevZ) / dt;
            if (wvx * wvx + wvz * wvz > 144) { wvx = 0; wvz = 0; }     // a teleport is not a sprint
        } else {
            this.bodyYaw = headYaw;
            this._placed = true;
        }
        this._prevX = px; this._prevZ = pz;

        // --- body yaw: hips follow the eyes with a dead-zone -----------------------
        const off = AvatarRig.shortestAngle(this.bodyYaw, headYaw);
        if (this.speed > 0.3) {
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
        const mF = this.speed > 1e-3 ? this.vF / this.speed : 1;
        const mR = this.speed > 1e-3 ? this.vR / this.speed : 0;
        this.walkW += ((this.speed > 0.15 ? 1 : 0) - this.walkW) * (1 - Math.exp(-8 * dt));
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
        root.position.set(
            cx - (F.x * this.pelvisF + R.x * this.pelvisR),
            Math.max(ground - 0.7, bodyFloor) + bob,
            cz - (F.z * this.pelvisF + R.z * this.pelvisR)
        );
        root.computeWorldMatrix(true);
        for (let i = 0; i < this._extNodes.length; i++) this._extNodes[i].computeWorldMatrix(true);
        for (let i = 0; i < this.order.length; i++) this.Lq[i].copyFrom(this.restQ[i]);
        this._refreshCache();

        // --- torso: counter-twist, lean, breath ---------------------------------------
        const tw = walkW * Math.sin(this.phase * 2 * Math.PI);
        const lean = Math.min(0.12, 0.02 + 0.012 * sp) * walkW + 0.01;
        const breath = 0.012 * Math.sin(this.time * 1.7);
        this._yawBy(ix.pelvis, -0.08 * tw);
        this._tiltBy(ix.spine_01, lean * 0.45, F.x, F.z);
        this._yawBy(ix.spine_01, 0.06 * tw);
        this._tiltBy(ix.spine_02, lean * 0.30 + breath, F.x, F.z);
        this._yawBy(ix.spine_02, 0.06 * tw);

        // --- head: the twist the hips did not take, split over spine, neck and head ----
        const yawLeft = Math.max(-1.45, Math.min(1.45, AvatarRig.shortestAngle(this.bodyYaw, headYaw) - 0.10 * tw));
        const pitch = Math.max(-0.9, Math.min(0.9, num(pose.headPitch, 0)));
        this._yawBy(ix.spine_03, 0.06 * tw + 0.2 * yawLeft);
        const sy = Math.sin(this.bodyYaw + 0.2 * yawLeft), cy = Math.cos(this.bodyYaw + 0.2 * yawLeft);
        this._tiltBy(ix.spine_03, lean * 0.25 - pitch * 0.15, sy, cy);
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
            const reach = BABYLON.Vector3.Distance(sh, this.pos[lower]) + BABYLON.Vector3.Distance(this.pos[lower], this.pos[hand]);
            const t = v[4];
            const h = a === 0 ? pose.left : pose.right;
            if (h && Number.isFinite(h.x)) {
                t.set(h.x - h.fx * 0.05, h.y - h.fy * 0.05, h.z - h.fz * 0.05);   // wrist sits behind the palm
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

    /** Re-fit the body when the active mode's eye-height calibration changes. */
    setEyeHeight(eyeHeight) {
        if (!this.ok || !(eyeHeight > 0.8) || Math.abs(eyeHeight - this.standEye) < 0.04) return;
        const yaw = this.root.rotation.y, pos = this.root.position.clone();
        this.order.forEach((n, i) => n.rotationQuaternion.copyFrom(this.restQ[i]));
        this._measure(Math.min(2.1, eyeHeight));
        this.root.rotation.y = yaw;
        this.root.position.copyFrom(pos);
    }

    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        this.ok = false;
        if (this.entry) { try { this.entry.dispose(); } catch (_) { /* already gone with the scene */ } }
        this.entry = null;
    }
}
window.AvatarRig = AvatarRig;