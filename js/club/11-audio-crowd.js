'use strict';

class VRClubAudioCrowd extends window.VRClubCrowd {

    _spawnWorkingBartender(container) {
        if (typeof AvatarRig === 'undefined') return null;
        const rig = new AvatarRig(this, container, { eyeHeight: 1.58 });
        if (!rig.ok) { rig.dispose(); return null; }
        const spot = window.VenueLayout.bar.bartender;
        rig.root.name = 'bartender';
        const hand = () => ({ x: 0, y: 0, z: 0, fx: -1, fy: 0, fz: 0, ux: 0, uy: 1, uz: 0 });
        const pose = {
            x: spot.x, z: spot.z, groundY: 0, eyeY: 1.58, headYaw: -Math.PI / 2, headPitch: 0, lean: 0.18,
            left: hand(), right: hand()
        };
        const npc = {
            name: 'bartender',
            character: container.character || null,
            characterSourceId: 'bartender',
            root: rig.root,
            meshes: rig.meshes,
            animations: [],
            baseSpeed: 1,
            reactsToBeat: false,
            homeYaw: null,
            avoidYaw: 0,
            rig
        };
        npc.collider = this._attachOccupantCollider(rig.root, 'bartender');
        this.npcAvatars.push(npc);
        this._bartenderRig = rig;
        this._bartenderNpc = npc;
        this._bartenderPose = pose;
        this._bartenderWashTime = 0;
        this._bartenderActivity = 'wash';
        this._bartenderActivityTime = 12;
        this._bartenderActivityIndex = 0;
        this._updateBartender(1 / 60, null);
        return npc;
    }

    _updateBartender(dt, service) {
        const rig = this._bartenderRig;
        const pose = this._bartenderPose;
        if (!rig || !pose || !rig.root.isEnabled()) return;
        this._bartenderWashTime += dt;
        const t = this._bartenderWashTime;
        const bar = window.VenueLayout.bar;
        const counter = this._barGlass ? this._barGlass.counter : null;
        const B = bar.bartender, top = bar.counter.top;
        let activity = service && service.activity === 'talk' ? 'survey' : 'service';
        if (!service) {
            this._bartenderActivityTime -= dt;
            if (this._bartenderActivityTime <= 0) {
                const activities = VRClubAudioCrowd.BARTENDER_ACTIVITIES;
                this._bartenderActivityIndex = (this._bartenderActivityIndex + 1) % activities.length;
                this._bartenderActivity = activities[this._bartenderActivityIndex];
                this._bartenderActivityTime = this._bartenderActivity === 'survey' ? 9 : 14;
            }
            activity = this._bartenderActivity || 'wash';
        }
        if (activity !== this._bartenderLastActivity) {
            this._bartenderLastActivity = activity;
            this._bartenderSettle = 1.2;
        }
        this._bartenderSettle = Math.max(0, (this._bartenderSettle || 0) - dt);

        let reach = 0;
        if (counter && service) {
            const raw = service.duration > 0 ? Math.min(1, Math.max(0, 1 - service.timer / service.duration)) : 1;
            if (service.activity === 'serve') reach = raw;
            else if (service.activity === 'served') reach = 1 - raw;
            else if (service.activity === 'clear') reach = raw < 0.5 ? raw * 2 : (1 - raw) * 2;
            reach = reach * reach * (3 - 2 * reach);
        }
        // She breathes and shifts her weight from foot to foot while she works; serving takes over the body.
        const idleLife = 1 - reach;
        pose.eyeY = 1.58 + 0.005 * Math.sin(t * 1.9);
        pose.x = B.x - reach * 0.48;
        pose.z = B.z + reach * 0.45 + idleLife * 0.03 * Math.sin(t * 0.37);

        // What she does is described in HER frame: which way she faces, and each hand's distance ahead (f), sideways
        // (l, positive to her right), height (y), finger pitch (p) and how far the palm turns down (in: 0 thumb up,
        // 1 palm down). The old world-space targets put her right hand on her left side whenever she turned, which
        // crossed her arms; in her own frame the right hand can never pass the left.
        const patron = service && service.barPatron && service.barPatron.root ? service.barPatron.root.position : null;
        const goal = this._bartenderGoal || (this._bartenderGoal = {});
        const polish = t * 2.6;
        const facePoint = (x, z) => Math.atan2(x - pose.x, z - pose.z);
        if (activity === 'wipe') {
            // Both palms flat on the counter, sweeping along it together; she turns to follow them.
            const sweep = Math.sin(t * 1.15);
            const cx = bar.counter.xBack - 0.10, cz = B.z - 0.22 + 0.26 * sweep;
            goal.yaw = facePoint(cx, cz);
            const reachAhead = Math.hypot(cx - pose.x, cz - pose.z);
            goal.rf = goal.lf = reachAhead;
            goal.rl = 0.11; goal.ll = -0.11;
            goal.ry = top + 0.055; goal.ly = top + 0.06;
            goal.rp = goal.lp = -0.18;
            goal.ri = goal.li = 1;
        } else if (activity === 'survey') {
            // Hands resting wide on the counter while she watches the room (or the guest she is talking to).
            goal.yaw = patron ? facePoint(patron.x, patron.z) : -Math.PI / 2 + 0.3 * Math.sin(t * 0.32);
            goal.rf = goal.lf = 0.47;
            goal.rl = 0.24; goal.ll = -0.24;
            goal.ry = goal.ly = top + 0.08;
            goal.rp = goal.lp = -0.2;
            goal.ri = goal.li = 1;
        } else if (activity === 'arrange') {
            // Turned to the back bar: the right hand lifts a bottle up and down while the left steadies the shelf.
            const lift = 0.5 + 0.5 * Math.sin(t * 1.35);
            goal.yaw = Math.PI / 2;
            goal.rf = goal.lf = bar.backBar.xFront - 0.06 - B.x;
            goal.rl = 0.20; goal.ll = -0.12;
            goal.ry = bar.backBar.shelves[0] + 0.02 + 0.42 * lift;
            goal.ly = bar.backBar.shelves[0] + 0.03;
            goal.rp = 0.15; goal.lp = -0.05;
            goal.ri = 0; goal.li = 0.8;
        } else {
            // Polishing a glass (and the start of serving): both hands together at chest height in front of her, thumbs up and
            // palms toward each other, the right hand turning the glass and the left circling inside it.
            const wash = idleLife;
            // Serving, she faces the glass's spot on the counter (her hand must reach it); the head looks at the guest.
            const faceX = counter ? (B.x - 0.42) + (counter.x - (B.x - 0.42)) * reach : B.x - 0.42;
            const faceZ = counter ? (B.z - 0.05) + (counter.z - (B.z - 0.05)) * reach : B.z - 0.05;
            goal.yaw = counter && service ? facePoint(faceX, faceZ) : -Math.PI / 2 - 0.15;
            goal.rf = 0.42;
            goal.lf = 0.42 - 0.03 * Math.cos(polish) * wash;
            goal.rl = 0.055;
            goal.ll = -0.055 + 0.02 * Math.sin(polish + 1) * wash;
            goal.ry = 1.27 + 0.012 * Math.sin(polish + 2) * wash;
            goal.ly = 1.25 + 0.03 * Math.sin(polish) * wash;
            goal.rp = 0.35; goal.lp = 0.45;
            goal.ri = goal.li = 0;
        }

        // She turns at a human pace, and her hands settle into each new job instead of jumping to it.
        if (!Number.isFinite(this._bartenderYaw)) this._bartenderYaw = goal.yaw;
        const turn = Math.atan2(Math.sin(goal.yaw - this._bartenderYaw), Math.cos(goal.yaw - this._bartenderYaw));
        const turnStep = Math.max(-2.4 * dt, Math.min(2.4 * dt, turn * (1 - Math.exp(-6 * dt))));
        this._bartenderYaw += turnStep;
        const hands = this._bartenderHands || (this._bartenderHands = { ...goal });
        const settle = 1 - Math.exp(-dt / (this._bartenderSettle > 0 ? 0.28 : 0.07));
        for (const key of ['rf', 'rl', 'ry', 'rp', 'ri', 'lf', 'll', 'ly', 'lp', 'li']) hands[key] += (goal[key] - hands[key]) * settle;
        const bodyYaw = this._bartenderYaw;
        const sinY = Math.sin(bodyYaw), cosY = Math.cos(bodyYaw);
        let rightX = pose.x + sinY * hands.rf + cosY * hands.rl, rightY = hands.ry, rightZ = pose.z + cosY * hands.rf - sinY * hands.rl;
        let leftX = pose.x + sinY * hands.lf + cosY * hands.ll, leftY = hands.ly, leftZ = pose.z + cosY * hands.lf - sinY * hands.ll;
        if (counter && reach > 0) {
            // Serving: the right hand carries the glass to the counter point; the left rests beside it, not on top of it.
            const leftCx = counter.x - cosY * 0.2 - sinY * 0.04, leftCz = counter.z + sinY * 0.2 - cosY * 0.04;
            rightX += (counter.x - rightX) * reach;
            rightY += (counter.y - rightY) * reach;
            rightZ += (counter.z - rightZ) * reach;
            leftX += (leftCx - leftX) * reach;
            leftY += (counter.y - 0.02 - leftY) * reach;
            leftZ += (leftCz - leftZ) * reach;
        }
        pose.lean = (activity === 'survey' ? 0.06 : activity === 'arrange' ? 0.02 : 0.12) + reach * 0.42;
        const aim = (hand, x, y, z, pitch, inward, side) => {
            hand.x = x; hand.y = y; hand.z = z;
            const cp = Math.cos(pitch), sp = Math.sin(pitch);
            hand.fx = sinY * cp; hand.fy = sp; hand.fz = cosY * cp;
            // The thumb side points up for a grip and toward the middle of her body for a flat palm.
            const ux = -cosY * side * inward * 0.95, uz = sinY * side * inward * 0.95, uy = 1 - inward * 0.7;
            const ul = Math.hypot(ux, uy, uz) || 1;
            hand.ux = ux / ul; hand.uy = uy / ul; hand.uz = uz / ul;
        };
        aim(pose.right, rightX, rightY, rightZ, hands.rp, hands.ri, 1);
        aim(pose.left, leftX, leftY, leftZ, hands.lp, hands.li, -1);
        const patronNpc = this._barPatron;
        const patronState = patronNpc && patronNpc.barPatron;
        const patronDrinking = !!patronState && ['pickup', 'drink', 'return'].includes(patronState.activity);
        const workYaw = bodyYaw;
        let headYaw = workYaw, headPitch = -0.28;
        if (patron) {
            headYaw = facePoint(patron.x, patron.z);
            headPitch = 0.02;
        } else if (activity === 'survey') {
            headPitch = 0.03;
        } else if (!service) {
            // Heads down over the work, with a glance up every ~11 s: at the regular while she drinks, otherwise
            // across the room.
            const cycle = (t % 11) / 11;
            const glance = cycle > 0.7 && cycle < 0.95 ? Math.sin(Math.PI * (cycle - 0.7) / 0.25) : 0;
            const eased = glance * glance * (3 - 2 * glance);
            let lookYaw = -Math.PI / 2 + 0.35 * Math.sin(t * 0.5);
            if (patronDrinking && patronNpc.root) {
                lookYaw = Math.atan2(patronNpc.root.position.x - pose.x, patronNpc.root.position.z - pose.z);
            }
            const lookOff = Math.atan2(Math.sin(lookYaw - workYaw), Math.cos(lookYaw - workYaw));
            // Watching the regular drink holds the glance until the bottle is down.
            const hold = patronDrinking ? 1 : eased;
            headYaw = workYaw + lookOff * 0.8 * hold;
            headPitch = -0.28 + 0.3 * hold;
        }
        pose.headYaw = headYaw;
        pose.headPitch = headPitch;
        pose.bodyYaw = bodyYaw;
        rig.bodyYaw = bodyYaw;
        rig.turning = false;
        rig.update(dt, pose);
        const collider = this._bartenderNpc && this._bartenderNpc.collider;
        if (collider) {
            collider.position.set(rig.root.position.x, rig.root.position.y + 0.85, rig.root.position.z);
        }
    }

    // ───────────────────────── the guest who works the room ─────────────────────────
    //
    // Everyone else at the sides stands where they were placed. One guest (the slot with `mingles`) walks a fixed
    // round of the venue: conversations, a bar visit, watching the floor, a smoke outside and the balcony. The round
    // is a CHAIN walked up and back down, not a loop, so every leg is hand-measured around people and furniture.
    // A stop whose guest the tier does not show is simply walked through, so he still has somewhere to go.

    /**
     * The round, in world coordinates. `guest` and `bartender` mark social stops; `activity` marks an intentional
     * solo stop; a node without any of them is navigation only. Surface height comes from VenueLayout/MezzanineLayout.
     */
    _minglerRoute() {
        return {
            speed: 1.05,            // a relaxed walk
            walkClipSpeed: 1.4,     // metres a second the packs' Walk clip is authored for (AvatarManager uses the same)
            // He lingers: a conversation lasts half a minute or so, then he moves on. (It was 9-17 s, and he spent most
            // of his time walking.)
            dwell: { min: 22, max: 38 },
            home: 1,
            nodes: [
                { x: -8.95, z: -13.75, guest: 6 },
                { x: -8.2, z: -10.8, yaw: 1.716, activity: 'watch', clip: 'Idle_Loop', dwell: { min: 25, max: 40 } },
                { x: -7.55, z: -6.5, guest: 4 },
                { x: -7.5, z: -5.5 },   // the lane along the front of the dance floor, the only way across the room
                { x: -2.0, z: -5.5 },
                { x: 5.2, z: -5.5 },
                { x: 5.2, z: -6.3 },
                // He periodically joins the floor rather than only watching it. This gap is hand-placed between the
                // active crowd slots, so his body and collider remain clear of every dancer while he moves.
                { x: 3.4, z: -9.1, yaw: Math.PI, activity: 'dance', clip: 'Dance_Loop', dwell: { min: 28, max: 48 } },
                { x: 5.2, z: -6.3 },
                { x: 7.9, z: -5.5 },
                { x: 8.3, z: -7.3, guest: 0 },  // a brief conversation with the standing guest beside the bar
                { x: 8.3, z: -6.3 },
                { x: 5.1, z: -6.3 },
                { x: 5.1, z: -7.1 },
                { x: 5.1, z: -9.65 },
                // Approach the gap between the stools square-on. The old diagonal from z -9.9 crossed the stool at
                // z -10.3, so the avatar visibly walked through its seat and legs.
                { x: 8.35, z: -9.65 },
                // Customer side of the counter, between stools: the bartender turns to him while he has a drink.
                // The dwell is set by the service itself (two sips, see _advanceMinglerDrink).
                { x: 9.55, z: -9.65, bartender: true, drink: true },
                { x: 8.35, z: -9.65 },
                { x: 8.35, z: -6.3 },
                // Out through the centre of both doors and up the vestibule stair; the queue is on the +x side.
                { x: 8.5, z: -5.5 },
                { x: 0, z: -5.5 },
                { x: 0, z: 0.65 },
                { x: 0, z: 5.0 },
                { x: 0, z: 6.6 },
                // A whole cigarette: a drag every twelve seconds (the Smoke_Loop), for a minute and a half or so.
                { x: -2.5, z: 7.1, yaw: Math.PI / 2, activity: 'smoke', clip: 'Smoke_Loop', dwell: { min: 75, max: 105 } },
                // Back down, then along the front lane to the mezzanine stair and up onto the deck.
                { x: 0, z: 6.6 },
                { x: 0, z: 5.0 },
                { x: 0, z: 0.65 },
                { x: 0, z: -5.5 },
                { x: -9.8, z: -5.5 },
                { x: -11.4, z: -6.2 },
                { x: -11.4, z: -8.3 },
                { x: -11.4, z: -10.4 },
                // At the balcony rail beside the woman already there (guest 3): hands on the rail, watching the floor,
                // then he turns to her and they talk (`talk`). The rail is at x -9.54; his Idle_Railing_Loop puts his
                // wrists 0.394 m ahead of his feet, so he stands at x -9.93, a metre along the rail from her.
                { x: -9.93, z: -12.95, yaw: Math.PI / 2, activity: 'balcony', clip: 'Idle_Railing_Loop', guest: 3,
                    dwell: { min: 25, max: 40 }, talk: { min: 25, max: 40 } }
            ]
        };
    }

    _startMingling(npc, _slot) {
        const route = this._mingleRoute || (this._mingleRoute = this._minglerRoute());
        npc.mingle = {
            phase: 'dwell', timer: 5, duration: 5, node: route.home | 0, dir: 1,
            yaw: route.nodes[route.home].yaw, baseYaw: route.nodes[route.home].yaw,
            attentionTime: 0, partner: null, returning: null, activity: 'watch'
        };
        this._mingler = npc;
        this._createMinglerDrink(npc);
        this._createMinglerSmoke(npc);
    }

    /** The guest standing in slot `index`, if this tier shows them. */
    _mingleGuest(index) {
        const name = `guest${index}`;
        const avatars = this.npcAvatars || [];
        for (let i = 0; i < avatars.length; i++) {
            if (avatars[i].name !== name) continue;
            return avatars[i].root && avatars[i].root.isEnabled() ? avatars[i] : null;
        }
        return null;
    }

    _mingleNamed(name) {
        const avatars = this.npcAvatars || [];
        for (let i = 0; i < avatars.length; i++) {
            const npc = avatars[i];
            if (npc.name === name && npc.root && npc.root.isEnabled()) return npc;
        }
        return null;
    }

    _createBartenderGlass(bartender) {
        if (this._barGlass || !bartender || !this.scene || !this.materialFactory || !BABYLON.MeshBuilder) return;
        // The glass lives in her physical RIGHT hand. Which of the skeleton's two hand bones that is depends on how the rig
        // measured its sides (a mirrored body swaps them), so ask the rig rather than trusting the bone's name.
        const rightSuffix = bartender.rig && bartender.rig.sideL > 0 ? 'l' : 'r';
        const wrist = bartender.root.getChildTransformNodes(false).find(node => node.name.endsWith(`hand_${rightSuffix}`));
        if (!wrist) return;
        const cup = BABYLON.MeshBuilder.CreateCylinder('minglerDrink', {
            diameterTop: 0.075, diameterBottom: 0.055, height: 0.12, tessellation: 12
        }, this.scene);
        cup.material = this.materialFactory.createPBRMaterial('minglerDrinkMat', {
            baseColor: [0.15, 0.18, 0.2], metallic: 0.65, roughness: 0.25
        }, true);
        cup.isPickable = false;
        cup.rotationQuaternion = new BABYLON.Quaternion();
        cup.renderingGroupId = 0;
        cup.setEnabled(false);
        const bar = window.VenueLayout && window.VenueLayout.bar;
        if (!bar) { cup.dispose(); return; }
        this._barGlass = {
            mesh: cup,
            bartender,
            serverWrist: wrist,
            minglerWrist: null,
            minglerHand: null,
            handAxis: new BABYLON.Vector3(0, 1, 0),
            _f: new BABYLON.Vector3(),
            _n: new BABYLON.Vector3(),
            _p: new BABYLON.Vector3(),
            _q: new BABYLON.Quaternion(),
            counter: new BABYLON.Vector3(bar.counter.xFront + 0.29, bar.counter.top + 0.06, bar.bartender.z + 0.515),
            handPosition: new BABYLON.Vector3(),
            serverPosition: new BABYLON.Vector3(),
            visible: false,
            mode: 'hidden'
        };
        this._updateMinglerDrink(null, 'wash');
    }

    _createMinglerDrink(npc) {
        const glass = this._barGlass;
        if (!npc || !glass || npc.drinkCup) return;
        glass.minglerWrist = npc.root.getChildTransformNodes(false).find(node => /Middle1\.R$/.test(node.name)) || null;
        glass.minglerHand = npc.root.getChildTransformNodes(false).find(node => /(^|[^A-Za-z])Wrist\.R$/.test(node.name)) || null;
        npc.drinkCup = glass.mesh;
        npc.drinkCounter = glass.counter;
        npc.drinkMode = glass.mode;
    }

    _startBarPatron(npc) {
        npc.barPatron = {
            activity: 'idle', timer: 18, duration: 18, next: 'talk', attentionTime: 0,
            homeYaw: npc.slotYaw, barPatron: npc
        };
        this._barPatron = npc;
        this._createBarPatronBottle(npc);
    }

    _createBarPatronBottle(npc) {
        if (!npc || npc.barBottle || !this.scene || !this.materialFactory || !BABYLON.MeshBuilder
            || typeof npc.root.getChildTransformNodes !== 'function') return;
        const wrist = npc.root.getChildTransformNodes(false).find(node => /Middle1\.R$/.test(node.name));
        const bar = window.VenueLayout && window.VenueLayout.bar;
        if (!wrist || !bar) return;
        const bottle = BABYLON.MeshBuilder.CreateCylinder('barPatronBottle', {
            diameterTop: 0.035, diameterBottom: 0.062, height: 0.19, tessellation: 12
        }, this.scene);
        bottle.material = this.materialFactory.createPBRMaterial('barPatronBottleMat', {
            baseColor: [0.12, 0.28, 0.18], metallic: 0.05, roughness: 0.22
        }, true);
        bottle.isPickable = false;
        npc.barBottle = {
            mesh: bottle,
            wrist,
            // Where her right palm rests (measured on the shipped Seated_Bar clips): the bottle stands in that hand,
            // 6 cm up the bottle from the palm and 3 cm toward her midline (her fingers wrap round it), so the grasp,
            // the lift and the put-down meet exactly here.
            counter: new BABYLON.Vector3(
                bar.counter.xFront - 0.002 + 0.03 * Math.cos(npc.root.rotation.y),
                bar.counter.top + 0.092,
                npc.root.position.z + 0.169 - 0.03 * Math.sin(npc.root.rotation.y)),
            hand: new BABYLON.Vector3(),
            axis: new BABYLON.Vector3(0, 1, 0),
            up: new BABYLON.Vector3(0, 1, 0),
            mode: 'counter'
        };
        bottle.rotationQuaternion = new BABYLON.Quaternion();
        bottle.position.copyFrom(npc.barBottle.counter);
    }

    /** How far the bottle is tipped toward her lips (0..1) at a point in the Seated_Bar_Drink_Loop (its 0..1 phase). */
    static barBottleTilt(phase) {
        const ease = t => { const c = Math.min(1, Math.max(0, t)); return c * c * (3 - 2 * c); };
        if (phase < 0.58) return ease((phase - 0.30) / 0.10);
        return 1 - ease((phase - 0.58) / 0.08);
    }

    _setBarPatronActivity(npc, activity, duration) {
        const state = npc.barPatron;
        state.activity = activity;
        state.duration = state.timer = duration;
        state.attentionTime = 0;
        const drinking = activity === 'pickup' || activity === 'drink' || activity === 'return';
        VRClubAudioCrowd._playClip(npc, drinking ? 'Seated_Bar_Drink_Loop' : 'Seated_Bar_Idle_Loop',
            drinking ? 1 : npc.baseSpeed, !drinking);
    }

    /** A seated regular alternates unhurried bartender conversation with an occasional bottle drink. */
    _updateBarPatron(dt) {
        const npc = this._barPatron;
        const state = npc && npc.barPatron;
        if (!state || !npc.root || !npc.root.isEnabled()) {
            if (npc && npc.barBottle) npc.barBottle.mesh.setEnabled(false);
            return null;
        }
        const step = Math.min(0.1, Math.max(0, dt || 0));
        state.timer -= step;
        state.attentionTime += step;
        if (state.timer <= 0) {
            if (state.activity === 'idle') {
                if (state.next === 'talk') {
                    state.next = 'drink';
                    this._setBarPatronActivity(npc, 'talk', 14 + Math.random() * 12);
                } else {
                    state.next = 'talk';
                    this._setBarPatronActivity(npc, 'pickup', 1.1);
                }
            } else if (state.activity === 'talk') {
                this._setBarPatronActivity(npc, 'idle', 32 + Math.random() * 38);
            } else if (state.activity === 'pickup') {
                this._setBarPatronActivity(npc, 'drink', 3.2);
            } else if (state.activity === 'drink') {
                this._setBarPatronActivity(npc, 'return', 1.2);
            } else {
                this._setBarPatronActivity(npc, 'idle', 38 + Math.random() * 42);
            }
        }

        let phase = 0;
        if (['pickup', 'drink', 'return'].includes(state.activity)) {
            const range = state.activity === 'pickup' ? [0, 0.2]
                : state.activity === 'drink' ? [0.2, 0.72] : [0.72, 0.94];
            const p = state.duration > 0 ? Math.min(1, Math.max(0, 1 - state.timer / state.duration)) : 1;
            phase = range[0] + (range[1] - range[0]) * p;
        }
        const group = npc.poses && npc.poses.groups.get('Seated_Bar_Drink_Loop');
        if (group && ['pickup', 'drink', 'return'].includes(state.activity)) {
            group.goToFrame(group.from + phase * (group.to - group.from));
        }

        const bottle = npc.barBottle;
        if (bottle) {
            bottle.mesh.setEnabled(true);
            const inHand = state.activity === 'drink' || state.activity === 'return';
            if (inHand) {
                // The bottle rides in her palm and tips toward her lips for the sip: its neck leans back at her face.
                const tilt = VRClubAudioCrowd.barBottleTilt(phase) * 1.15;
                const yaw = npc.root.rotation.y;
                bottle.axis.set(-Math.sin(yaw) * Math.sin(tilt), Math.cos(tilt), -Math.cos(yaw) * Math.sin(tilt));
                bottle.wrist.computeWorldMatrix(true).getTranslationToRef(bottle.hand);
                bottle.mesh.position.copyFrom(bottle.hand);
                bottle.mesh.position.x += bottle.axis.x * 0.06 + 0.03 * Math.cos(yaw);
                bottle.mesh.position.y += bottle.axis.y * 0.06;
                bottle.mesh.position.z += bottle.axis.z * 0.06 - 0.03 * Math.sin(yaw);
                BABYLON.Quaternion.FromUnitVectorsToRef(bottle.up, bottle.axis, bottle.mesh.rotationQuaternion);
                bottle.mode = 'hand';
            } else {
                bottle.mesh.position.copyFrom(bottle.counter);
                bottle.mesh.rotationQuaternion.set(0, 0, 0, 1);
                bottle.mode = 'counter';
            }
        }

        const facingBartender = state.activity === 'talk';
        const targetYaw = facingBartender ? state.homeYaw - 0.28 : state.homeYaw;
        VRClubAudioCrowd._easeYaw(npc.root, targetYaw, step, 1.2);
        return state.activity === 'talk' ? state : null;
    }

    /**
     * His cigarette: one small mesh (white paper, tan filter, vertex-coloured, unlit so it reads at night), a glowing
     * tip, and two small particle systems sharing the club's smoke texture (a thin wisp from the tip, and the exhale
     * from his mouth after each drag). Nothing exists to draw until he lights up outside.
     */
    _createMinglerSmoke(npc) {
        if (!npc || npc.smoke || !this.scene || !this.materialFactory || !BABYLON.MeshBuilder) return;
        const nodes = npc.root.getChildTransformNodes(false);
        const bone = suffix => nodes.find(node => node.name.endsWith(suffix)) || null;
        const bones = {
            index3: bone('Index3.R'), index4: bone('Index4.R'), middle3: bone('Middle3.R'), middle4: bone('Middle4.R'),
            middle2: bone('Middle2.R'), head: bone('_Head') || bone('Head')
        };
        if (Object.values(bones).some(node => !node)) return;

        // Pivot at the filter end, the burning end up its +y axis: 2.2 cm of filter and 6.3 cm of paper.
        const part = (name, height, y, colour) => {
            const mesh = BABYLON.MeshBuilder.CreateCylinder(name, { diameter: 0.0085, height, tessellation: 8 }, this.scene);
            mesh.position.y = y;
            const count = mesh.getTotalVertices();
            const colours = new Float32Array(count * 4);
            for (let i = 0; i < count; i++) colours.set(colour, i * 4);
            mesh.setVerticesData(BABYLON.VertexBuffer.ColorKind, colours);
            return mesh;
        };
        const cigarette = BABYLON.Mesh.MergeMeshes([
            part('minglerCigaretteFilter', 0.022, 0.011, [0.78, 0.52, 0.28, 1]),
            part('minglerCigarettePaper', 0.063, 0.022 + 0.0315, [0.93, 0.92, 0.88, 1])
        ], true);
        if (!cigarette) return;
        cigarette.name = 'minglerCigarette';
        // Unlit: only the emissive colour reaches the screen (multiplied by the vertex colours), so a lit-looking
        // diffuse colour here would render the paper black at night.
        cigarette.material = this.materialFactory.createStandardMaterial('minglerCigaretteMat', {
            emissiveColor: [0.72, 0.72, 0.72], disableLighting: true
        });
        cigarette.isPickable = false;
        cigarette.rotationQuaternion = new BABYLON.Quaternion();
        const ember = BABYLON.MeshBuilder.CreateSphere('minglerCigaretteEmber', { diameter: 0.0095, segments: 6 }, this.scene);
        ember.material = this.materialFactory.createStandardMaterial('minglerCigaretteEmberMat', {
            emissiveColor: [1, 0.32, 0.06], disableLighting: true, mutable: true
        });
        ember.parent = cigarette;
        ember.position.y = 0.085;
        ember.isPickable = false;
        cigarette.setEnabled(false);

        const texture = this._fogParticleTexture;
        const smoke = (name, capacity) => {
            if (!texture || !BABYLON.ParticleSystem) return null;
            const ps = new BABYLON.ParticleSystem(name, capacity, this.scene);
            ps.particleTexture = texture;
            ps.blendMode = BABYLON.ParticleSystem.BLENDMODE_STANDARD;
            ps.minEmitPower = 1;
            ps.maxEmitPower = 1;
            ps.colorDead = new BABYLON.Color4(0.6, 0.6, 0.64, 0);
            ps.direction1 = new BABYLON.Vector3();
            ps.direction2 = new BABYLON.Vector3();
            ps.minEmitBox = new BABYLON.Vector3(-0.004, 0, -0.004);
            ps.maxEmitBox = new BABYLON.Vector3(0.004, 0.004, 0.004);
            ps.emitter = new BABYLON.Vector3();
            ps.emitRate = 0;
            return ps;
        };
        // The wisp: a thin grey thread curling up from the tip.
        const wisp = smoke('minglerSmokeWisp', 60);
        if (wisp) {
            wisp.color1 = new BABYLON.Color4(0.9, 0.9, 0.94, 0.7);
            wisp.color2 = new BABYLON.Color4(0.82, 0.82, 0.88, 0.5);
            wisp.minSize = 0.018; wisp.maxSize = 0.03;
            // Size gradients are absolute sizes in metres (not factors of minSize/maxSize): 2-3 cm out of the tip,
            // a 10-14 cm curl by the time it fades.
            wisp.addSizeGradient(0, 0.018, 0.03); wisp.addSizeGradient(1, 0.1, 0.14);
            wisp.minLifeTime = 2.0; wisp.maxLifeTime = 3.4;
            wisp.direction1.set(-0.025, 0.07, -0.025);
            wisp.direction2.set(0.025, 0.13, 0.025);
            wisp.gravity = new BABYLON.Vector3(0.01, 0.015, 0);
        }
        // The exhale: a soft cloud pushed out of the mouth, slowing and spreading as it rises.
        const exhale = smoke('minglerSmokeExhale', 60);
        if (exhale) {
            exhale.color1 = new BABYLON.Color4(0.92, 0.92, 0.96, 0.6);
            exhale.color2 = new BABYLON.Color4(0.84, 0.84, 0.9, 0.42);
            exhale.minSize = 0.035; exhale.maxSize = 0.06;
            // Absolute metres, like the wisp: a mouthful at the lips that spreads to a 30-45 cm cloud.
            exhale.addSizeGradient(0, 0.04, 0.07); exhale.addSizeGradient(1, 0.3, 0.45);
            exhale.minLifeTime = 1.4; exhale.maxLifeTime = 2.4;
            if (exhale.addLimitVelocityGradient) { exhale.addLimitVelocityGradient(0, 0.5); exhale.addLimitVelocityGradient(1, 0.04); exhale.limitVelocityDamping = 0.9; }
            exhale.gravity = new BABYLON.Vector3(0, 0.06, 0);
        }

        npc.smokeProp = cigarette;
        npc.smoke = {
            bones, cigarette, ember, wisp, exhale,
            mouth: null, breath: null,
            baseScaleY: 1, visible: false, glow: 0.35, wasNear: false, exhaleIn: 0, exhaleLeft: 0, smoked: 0,
            filter: new BABYLON.Vector3(), mouthPos: new BABYLON.Vector3(), breathPos: new BABYLON.Vector3(),
            direction: new BABYLON.Vector3()
        };
    }

    /**
     * Put the cigarette between his index and middle fingers, pinched near the fingertips, through the palm: the filter
     * on the palm side (his lips when the hand is up) and the burning end out past the back of the hand. Measured in
     * the body's own (glTF) frame, because a spawned person is mirrored in the world (the root's handedness flip is
     * replaced by a plain yaw), which would turn a world-space cross product inside out. Also marks his mouth on the
     * Head bone. Once per smoke stop: the fingers' current curl is what it holds. Parented to the middle finger's
     * outer segment, so it moves with the fingers.
     */
    _attachCigarette(npc) {
        const s = npc.smoke;
        const root = npc.root.computeWorldMatrix(true);
        const toBody = root.clone().invert();
        const local = node => BABYLON.Vector3.TransformCoordinates(node.computeWorldMatrix(true).getTranslation(), toBody);
        const i3 = local(s.bones.index3), i4 = local(s.bones.index4), m3 = local(s.bones.middle3), m4 = local(s.bones.middle4);
        const hold = i3.add(i4).add(m3).add(m4).scaleInPlace(0.25);
        const fingers = m4.subtract(m3).normalize();
        const palm = BABYLON.Vector3.Cross(i3.subtract(m3), fingers).normalize();
        const holdWorld = BABYLON.Vector3.TransformCoordinates(hold, root);
        const palmWorld = BABYLON.Vector3.TransformNormal(palm, root).normalize();
        const filter = holdWorld.add(palmWorld.scale(0.045));
        const along = BABYLON.Quaternion.Identity();
        BABYLON.Quaternion.FromUnitVectorsToRef(BABYLON.Vector3.Up(), palmWorld.negate(), along);
        const world = BABYLON.Matrix.Compose(BABYLON.Vector3.One(), along, filter);
        const parentWorld = s.bones.middle3.computeWorldMatrix(true);
        const cigarette = s.cigarette;
        cigarette.parent = s.bones.middle3;
        world.multiply(parentWorld.clone().invert()).decompose(cigarette.scaling, cigarette.rotationQuaternion, cigarette.position);
        s.baseScaleY = cigarette.scaling.y;

        // His lips, 0.115 m in front of and 6 mm above the Head joint (measured on m6's face), and where he blows:
        // up and off to his right (the Smoke_Loop also lifts and turns his chin), not into the face of whoever stands
        // in front of him.
        if (!s.mouth) {
            s.mouth = new BABYLON.TransformNode('minglerMouth', this.scene);
            s.breath = new BABYLON.TransformNode('minglerBreath', this.scene);
        }
        const head = s.bones.head.computeWorldMatrix(true);
        const toHead = head.clone().invert();
        const scale = npc.root.scaling.x || 1;
        const yaw = npc.root.rotation.y;
        const forward = new BABYLON.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        const right = new BABYLON.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
        // Characters are mirrored in the world (see above), so "his right" is found from the smoking hand, not assumed.
        const handSide = Math.sign(BABYLON.Vector3.Dot(s.bones.middle2.getAbsolutePosition().subtract(npc.root.position), right)) || 1;
        const lips = head.getTranslation().add(forward.scale(0.115 * scale)).addInPlaceFromFloats(0, 0.006 * scale, 0);
        const blow = lips.add(forward.scale(0.14)).addInPlace(right.scale(0.12 * handSide)).addInPlaceFromFloats(0, 0.22, 0);
        for (const [node, at] of [[s.mouth, lips], [s.breath, blow]]) {
            node.parent = s.bones.head;
            node.position.copyFrom(BABYLON.Vector3.TransformCoordinates(at, toHead));
        }
    }

    _updateMinglerSmoke(npc, visible, dt = 0, total = 0) {
        const s = npc && npc.smoke;
        if (!s) return;
        visible = !!visible;
        if (s.visible !== visible) {
            s.visible = visible;
            if (visible) {
                this._attachCigarette(npc);
                s.smoked = 0; s.glow = 0.35; s.wasNear = false; s.exhaleIn = 0; s.exhaleLeft = 0;
                if (s.wisp) s.wisp.start();
                if (s.exhale) s.exhale.start();
            } else {
                if (s.wisp) s.wisp.stop();
                if (s.exhale) s.exhale.stop();
            }
            s.cigarette.setEnabled(visible);
        }
        if (!visible) return;
        const step = Math.max(0, dt || 0);
        s.smoked += step;
        // It burns down over the stop, to a stub.
        const burn = 1 - 0.45 * Math.min(1, s.smoked / Math.max(1, total));
        s.cigarette.scaling.y = s.baseScaleY * burn;
        s.ember.scaling.y = 1 / burn;

        s.cigarette.computeWorldMatrix(true).getTranslationToRef(s.filter);
        s.mouth.computeWorldMatrix(true).getTranslationToRef(s.mouthPos);
        s.breath.computeWorldMatrix(true).getTranslationToRef(s.breathPos);
        // A drag is whenever the filter is at his lips; the exhale follows once the hand has come down.
        const near = BABYLON.Vector3.Distance(s.filter, s.mouthPos) < 0.05;
        if (!near && s.wasNear) s.exhaleIn = 0.45;
        s.wasNear = near;
        if (s.exhaleIn > 0) { s.exhaleIn -= step; if (s.exhaleIn <= 0) s.exhaleLeft = 1.5; }
        const k = 1 - Math.exp(-step * 8);
        s.glow += ((near ? 1 : 0.32) - s.glow) * k;
        s.ember.material.emissiveColor.set(s.glow, 0.32 * s.glow * s.glow + 0.04, 0.06 * s.glow);
        s.ember.scaling.x = s.ember.scaling.z = 0.85 + 0.35 * s.glow;

        if (s.wisp) {
            s.ember.computeWorldMatrix(true).getTranslationToRef(s.wisp.emitter);
            s.wisp.emitRate = near ? 3 : 10;
        }
        if (s.exhale) {
            s.exhale.emitter.copyFrom(s.mouthPos);
            if (s.exhaleLeft > 0) {
                s.exhaleLeft -= step;
                s.direction.copyFrom(s.breathPos).subtractInPlace(s.mouthPos);
                s.exhale.direction1.copyFrom(s.direction).scaleInPlace(0.8).addInPlaceFromFloats(-0.06, -0.03, -0.06);
                s.exhale.direction2.copyFrom(s.direction).scaleInPlace(1.25).addInPlaceFromFloats(0.06, 0.05, 0.06);
                // Strongest at the start of the breath, trailing off.
                s.exhale.emitRate = 34 * Math.min(1, s.exhaleLeft / 1.5 + 0.2);
            } else {
                s.exhale.emitRate = 0;
            }
        }
    }

    _minglerSurfaceLevel(x, z, current) {
        const venue = window.VenueLayout && window.VenueLayout.vestibule;
        const entrance = venue && venue.walkLevel(x, z);
        if (Number.isFinite(entrance)) return entrance;
        const mezz = window.MezzanineLayout;
        return mezz && mezz.walkLevel ? mezz.walkLevel(x, z, current) : 0;
    }

    _updateMinglerDrink(npc, mode, progress) {
        const glass = this._barGlass;
        if (!glass) return;
        const cup = glass.mesh;
        const visible = mode !== 'hidden' && glass.bartender.root.isEnabled();
        if (glass.visible !== visible) {
            cup.setEnabled(visible);
            glass.visible = visible;
        }
        glass.mode = mode;
        if (npc) npc.drinkMode = mode;
        if (!visible) return;
        progress = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 1));
        glass.serverWrist.computeWorldMatrix(true).getTranslationToRef(glass.serverPosition);
        glass.serverPosition.y += 0.055;
        if (mode === 'wash' || mode === 'serve') {
            cup.rotationQuaternion.set(0, 0, 0, 1);
            cup.position.copyFrom(glass.serverPosition);
            return;
        }
        if (glass.minglerWrist && glass.minglerHand) this._updateMinglerGrip(glass);
        const held = mode === 'hand' || mode === 'return';
        if (held) {
            cup.position.copyFrom(glass.handPosition);
            this._tiltMinglerCup(glass);
            return;
        }
        cup.rotationQuaternion.set(0, 0, 0, 1);
        if (mode === 'counter' || mode === 'pickup' || (mode === 'clear' && progress < 0.5)) {
            cup.position.copyFrom(glass.counter);
        } else if (mode === 'clear') {
            cup.position.copyFrom(glass.serverPosition);
        }
    }

    // His grip, read from the hand itself: the cup sits in the palm, 4.5 cm toward its face, its axis along the thumb side.
    // The wrist-local directions are the m6 skeleton's own (fingers along +Y, thumb side along -X, palm toward -Z).
    _updateMinglerGrip(glass) {
        if (this._mingler && this._mingler.character) {
            if (!glass.characterKnuckles) {
                const nodes = this._mingler.root.getChildTransformNodes(false);
                glass.characterKnuckles = ['Index2.R', 'Pinky2.R'].map(name => nodes.find(node => node.name.endsWith(`_${name}`)));
            }
            const [index, pinky] = glass.characterKnuckles;
            if (!index || !pinky) throw new Error('Character grip landmarks are missing.');
            glass.minglerHand.computeWorldMatrix(true);
            glass.minglerWrist.computeWorldMatrix(true);
            index.computeWorldMatrix(true); pinky.computeWorldMatrix(true);
            const wrist = glass.minglerHand.absolutePosition, middle = glass.minglerWrist.absolutePosition;
            glass._f.copyFrom(middle).subtractInPlace(wrist).normalize();
            glass.handAxis.copyFrom(index.absolutePosition).subtractInPlace(pinky.absolutePosition);
            glass._n.copyFrom(glass._f).scaleInPlace(BABYLON.Vector3.Dot(glass.handAxis, glass._f));
            glass.handAxis.subtractInPlace(glass._n).normalize();
            BABYLON.Vector3.CrossToRef(glass.handAxis, glass._f, glass._n);
            glass._n.normalize();
            glass.handPosition.copyFrom(wrist).addInPlace(middle).scaleInPlace(0.5);
            glass.handPosition.x += glass._n.x * 0.045 + glass.handAxis.x * 0.01;
            glass.handPosition.y += glass._n.y * 0.045 + glass.handAxis.y * 0.01;
            glass.handPosition.z += glass._n.z * 0.045 + glass.handAxis.z * 0.01;
            return;
        }
        const wrist = glass.minglerHand.computeWorldMatrix(true);
        const knuckle = glass.minglerWrist.computeWorldMatrix(true);
        const f = glass._f, n = glass._n, t = glass.handAxis, p = glass._p;
        BABYLON.Vector3.TransformNormalFromFloatsToRef(0, 1, 0, wrist, f);
        BABYLON.Vector3.TransformNormalFromFloatsToRef(-0.9994, 0, -0.0341, wrist, t);
        f.normalize();
        t.normalize();
        BABYLON.Vector3.CrossToRef(t, f, n);
        n.normalize();
        wrist.getTranslationToRef(p);
        knuckle.getTranslationToRef(glass.handPosition);
        glass.handPosition.addInPlace(p).scaleInPlace(0.5);
        glass.handPosition.x += n.x * 0.045 + t.x * 0.01;
        glass.handPosition.y += n.y * 0.045 + t.y * 0.01;
        glass.handPosition.z += n.z * 0.045 + t.z * 0.01;
    }

    // The cup follows the thumb axis, less the slight natural cant of a relaxed grip, so it stands upright on the counter
    // and tips only for the sip.
    _tiltMinglerCup(glass) {
        const axis = glass.handAxis;
        const angle = Math.acos(Math.min(1, Math.max(-1, axis.y))) - 0.28;
        if (angle <= 0) {
            glass.mesh.rotationQuaternion.set(0, 0, 0, 1);
            return;
        }
        const about = glass._n.copyFromFloats(axis.z, 0, -axis.x);
        if (about.lengthSquared() < 1e-8) return;
        about.normalize();
        BABYLON.Quaternion.RotationAxisToRef(about, angle, glass.mesh.rotationQuaternion);
    }

    _advanceMinglerDrink(npc, route) {
        const state = npc.mingle;
        if (state.activity === 'order') {
            state.activity = 'serve'; state.duration = state.timer = 1.2;
        } else if (state.activity === 'serve') {
            state.activity = 'served'; state.duration = state.timer = 1.8;
        } else if (state.activity === 'served') {
            state.activity = 'pickup'; state.duration = state.timer = 0.8;
            VRClubAudioCrowd._playClip(npc, 'Drink_Loop', 1, false);
        } else if (state.activity === 'pickup') {
            state.activity = 'drink'; state.duration = state.timer = 1.9;
            state.sips = (state.sips || 0) + 1;
        } else if (state.activity === 'drink') {
            state.activity = 'return'; state.duration = state.timer = 0.9;
        } else if (state.activity === 'return') {
            // The glass goes back on the counter and he talks with the bartender a while before the next sip.
            state.activity = 'returned'; state.duration = state.timer = 7;
            VRClubAudioCrowd._playClip(npc, 'Idle_Talking_Loop', npc.baseSpeed);
        } else if (state.activity === 'returned' && (state.sips || 0) < 2) {
            state.activity = 'pickup'; state.duration = state.timer = 0.8;
            VRClubAudioCrowd._playClip(npc, 'Drink_Loop', 1, false);
        } else if (state.activity === 'returned') {
            state.activity = 'clear'; state.duration = state.timer = 1.2;
        } else {
            this._minglerDepart(npc, route);
        }
    }

    _syncMinglerDrinkPose(npc) {
        const state = npc.mingle;
        const group = npc.poses && npc.poses.groups.get('Drink_Loop');
        if (!group) return;
        let start, end;
        if (state.activity === 'pickup') { start = 0; end = 0.2; }
        else if (state.activity === 'drink') { start = 0.2; end = 0.68; }
        else if (state.activity === 'return') { start = 0.68; end = 0.9; }
        else return;
        const progress = state.duration > 0 ? Math.min(1, Math.max(0, 1 - state.timer / state.duration)) : 1;
        group.goToFrame(group.from + (start + (end - start) * progress) * (group.to - group.from));
    }

    /** Per frame: walk the round, hold the conversations, and carry the collider and the contact shadow along. */
    _updateMingler(dt) {
        const step = Math.min(0.1, Math.max(0, dt || 0));
        const patronService = this._updateBarPatron(step);
        const npc = this._mingler;
        const state = npc && npc.mingle;
        if (!state || !npc.root) {
            this._updateBartender(step, patronService);
            this._updateMinglerDrink(null, 'wash');
            return;
        }
        if (!npc.root.isEnabled()) {
            this._releaseMinglerPartner(state);
            if (state.returning && state.returning.root) {
                state.returning.root.rotation.y = state.returning.slotYaw || 0;
                state.returning.root.rotation.x = 0;
                state.returning = null;
            }
            this._updateBartender(step, patronService);
            this._updateMinglerDrink(npc, 'wash');
            this._updateMinglerSmoke(npc, false);
            return;
        }
        const route = this._mingleRoute || (this._mingleRoute = this._minglerRoute());
        const pos = npc.root.position;

        const client = this.multiplayer && this.multiplayer.client;
        const roomTime = client && typeof client.worldTime === 'function' ? client.worldTime() : null;
        if (Number.isFinite(roomTime)) {
            this._sampleSharedMingler(npc, route, client.worldClock, roomTime);
        } else if (state.phase === 'walk') {
            const node = route.nodes[state.node];
            const dx = node.x - pos.x, dz = node.z - pos.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const travel = route.speed * step;
            if (distance <= Math.max(travel, 0.02)) {
                pos.x = node.x;
                pos.z = node.z;
                pos.y = this._minglerSurfaceLevel(pos.x, pos.z, pos.y);
                this._minglerArrive(npc, route, node);
            } else {
                pos.x += (dx / distance) * travel;
                pos.z += (dz / distance) * travel;
                pos.y = this._minglerSurfaceLevel(pos.x, pos.z, pos.y);
                state.yaw = Math.atan2(dx, dz);
            }
        } else {
            state.timer -= step;
            state.attentionTime = (state.attentionTime || 0) + step;
            if (state.partner && !state.partner.root.isEnabled()) {
                this._minglerDepart(npc, route);   // a lower tier took them away
                return;
            }
            if (state.partner && state.partner.root && !state.partner.rig) {
                const px = state.partner.root.position;
                state.yaw = Math.atan2(px.x - pos.x, px.z - pos.z) + (state.activity === 'talk' && !state.drinkStop ? 0.2 : 0);
            } else if ((state.activity === 'watch' || state.activity === 'smoke') && Number.isFinite(state.baseYaw)) {
                const amount = state.activity === 'smoke' ? 0.22 : 0.13;
                state.yaw = state.baseYaw + amount * (
                    0.72 * Math.sin(state.attentionTime * 0.29)
                    + 0.28 * Math.sin(state.attentionTime * 0.11 + 1.4)
                );
            }
            if (state.timer <= 0) {
                if (state.drinkStop) this._advanceMinglerDrink(npc, route);
                else if (state.talkGuest != null) this._minglerTurnToTalk(npc, route);
                else this._minglerDepart(npc, route);
            }
        }

        this._updateBartender(step, state.partner && state.partner.name === 'bartender' ? state : patronService);
        this._syncMinglerDrinkPose(npc);
        if (Number.isFinite(roomTime)) npc.root.rotation.y = state.yaw;
        else VRClubAudioCrowd._easeYaw(npc.root, state.yaw, step, 4.0);
        const closeTalk = state.activity === 'talk' && !state.drinkStop && state.partner && !state.partner.rig;
        const turn = closeTalk ? 0.5 + 0.5 * Math.sin((state.attentionTime || 0) * Math.PI / 7) : 0;
        VRClubAudioCrowd._easeMinglerLean(npc.root, closeTalk ? 0.035 + 0.1 * turn : 0, step);
        // The people he stops at look at him while he is there, and go back to the way they were placed afterwards.
        if (state.partner && state.partner.root) {
            const px = state.partner.root.position;
            const earAngle = state.activity === 'talk' && !state.drinkStop ? 0.2 : 0;
            VRClubAudioCrowd._easeYaw(state.partner.root, Math.atan2(pos.x - px.x, pos.z - px.z) + earAngle, step, 2.2);
            if (!state.partner.rig) VRClubAudioCrowd._easeMinglerLean(state.partner.root, closeTalk ? 0.035 + 0.1 * (1 - turn) : 0, step);
        }
        if (state.returning && state.returning.root) {
            const facingHome = VRClubAudioCrowd._easeYaw(state.returning.root, state.returning.slotYaw || 0, step, 2.0);
            const upright = VRClubAudioCrowd._easeMinglerLean(state.returning.root, 0, step);
            if (facingHome && upright) {
                state.returning = null;
            }
        }
        const progress = state.duration > 0 ? 1 - state.timer / state.duration : 1;
        const drinkMode = state.activity === 'serve' ? 'serve'
            : state.activity === 'served' || state.activity === 'returned' ? 'counter'
                : state.activity === 'pickup' ? 'pickup'
                    : state.activity === 'drink' ? 'hand'
                        : state.activity === 'return' ? 'return'
                            : state.activity === 'clear' ? 'clear' : 'wash';
        this._updateMinglerDrink(npc, drinkMode, progress);
        this._updateMinglerSmoke(npc, state.activity === 'smoke', step, state.duration);
        if (Number.isFinite(roomTime) && state.activity === 'smoke' && npc.smoke) {
            const smoke = npc.smoke;
            smoke.smoked = state.attentionTime;
            smoke.cigarette.scaling.y = smoke.baseScaleY * (1 - 0.45 * Math.min(1, smoke.smoked / state.duration));
            smoke.ember.scaling.y = smoke.baseScaleY / smoke.cigarette.scaling.y;
        }
        if (npc.collider) npc.collider.position.set(pos.x, pos.y + 0.85, pos.z);
        this._moveContactShadow(npc);
    }

    _sampleSharedMingler(npc, route, clock, seconds) {
        if (!this._sharedMingleClock || this._sharedMingleSeed !== clock.seed || this._sharedMingleStart !== clock.startedAt) {
            const slots = this._guestSlots();
            this._sharedMingleClock = new window.MinglerClock(route, clock.seed,
                (x, z, level) => this._minglerSurfaceLevel(x, z, level),
                node => node.bartender ? window.VenueLayout.bar.bartender : slots[node.guest]);
            this._sharedMingleSeed = clock.seed;
            this._sharedMingleStart = clock.startedAt;
        }
        const sample = this._sharedMingleClock.sample(seconds), state = npc.mingle;
        const node = route.nodes[sample.node];
        const partner = sample.phase === 'dwell' && sample.activity !== 'balcony' && sample.activity !== 'watch' &&
            sample.activity !== 'smoke'
            ? node.bartender ? this._mingleNamed('bartender') : this._mingleGuest(node.guest) : null;
        if (state.partner !== partner) {
            this._releaseMinglerPartner(state);
            state.partner = partner;
            if (partner) VRClubAudioCrowd._playClip(partner, 'Idle_Talking_Loop', partner.baseSpeed);
        }
        state.phase = sample.phase;
        state.node = sample.node;
        state.dir = sample.dir;
        state.activity = sample.activity;
        state.duration = sample.duration;
        state.timer = sample.timer;
        state.attentionTime = sample.elapsed;
        state.yaw = state.baseYaw = sample.yaw;
        state.sips = sample.sips;
        state.drinkStop = !!node.drink && sample.phase === 'dwell';
        state.talkGuest = sample.activity === 'balcony' ? node.guest : null;
        npc.root.position.set(sample.x, this._minglerSurfaceLevel(sample.x, sample.z, sample.level), sample.z);
        const drinking = sample.clip === 'Drink_Loop';
        const dancing = sample.clip === 'Dance_Loop';
        const speed = sample.phase === 'walk' ? route.speed / route.walkClipSpeed
            : drinking ? 1 : dancing ? Math.max(0.65, Math.min(1.5, ((this.vjDirector && this.vjDirector.bpm) || 120) / 120))
                : npc.baseSpeed;
        VRClubAudioCrowd._playClip(npc, sample.clip, speed, !drinking);
        const group = npc.animations[0];
        if (!drinking && group && group.targetedAnimations.length && group.to > group.from) {
            const fps = group.targetedAnimations[0].animation.framePerSecond;
            group.goToFrame(group.from + (sample.elapsed * speed * fps) % (group.to - group.from));
        }
    }

    _releaseMinglerPartner(state) {
        if (!state.partner) return;
        VRClubAudioCrowd._playClip(state.partner, state.partner.slotClip, state.partner.baseSpeed);
        if (state.returning && state.returning.root) {
            state.returning.root.rotation.y = state.returning.slotYaw || 0;
            state.returning.root.rotation.x = 0;
        }
        state.returning = state.partner;
        state.partner = null;
    }

    static _easeMinglerLean(root, target, dt) {
        const current = root.rotation.x || 0;
        const next = current + (target - current) * (1 - Math.exp(-3 * dt));
        root.rotation.x = Math.abs(next - target) < 0.001 ? target : next;
        return root.rotation.x === target;
    }

    _minglerArrive(npc, route, node) {
        const state = npc.mingle;
        if (node.activity) {
            const dwell = node.dwell || route.dwell;
            state.phase = 'dwell';
            state.duration = state.timer = dwell.min + Math.random() * (dwell.max - dwell.min);
            state.partner = null;
            state.drinkStop = false;
            // A solo stop next to somebody (the balcony rail) turns into a conversation once he has had his look.
            state.talkGuest = node.guest != null ? node.guest : null;
            state.activity = node.activity;
            state.attentionTime = 0;
            if (Number.isFinite(node.yaw)) state.yaw = state.baseYaw = node.yaw;
            const dancing = node.activity === 'dance';
            const speed = dancing ? Math.max(0.65, Math.min(1.5, ((this.vjDirector && this.vjDirector.bpm) || 120) / 120))
                : npc.baseSpeed;
            VRClubAudioCrowd._playClip(npc, node.clip || 'Idle_Loop', speed);
            if (dancing) {
                const group = npc.animations[0];
                const beat = this.vjDirector && Number.isFinite(this.vjDirector.beatNumber) ? this.vjDirector.beatNumber : 0;
                if (group && group.to > group.from) group.goToFrame(group.from + (beat % 4) / 4 * (group.to - group.from));
            }
            return;
        }
        if (node.guest == null && !node.bartender) {
            this._minglerDepart(npc, route);
            return;
        }
        const partner = node.bartender ? this._mingleNamed('bartender')
            : node.guest == null ? null : this._mingleGuest(node.guest);
        if (!partner && (node.guest != null || node.bartender)) {
            this._minglerDepart(npc, route);   // nobody stands here on this tier: walk straight on
            return;
        }
        state.phase = 'dwell';
        const dwell = node.dwell || route.dwell;
        state.timer = dwell.min + Math.random() * (dwell.max - dwell.min);
        state.duration = state.timer;
        state.partner = partner;
        state.drinkStop = !!node.drink;
        state.talkGuest = null;
        state.sips = 0;
        state.activity = node.drink ? 'order' : partner ? 'talk' : 'idle';
        state.attentionTime = 0;
        state.baseYaw = state.yaw;
        if (node.drink) {
            state.duration = state.timer = 2.5;
            VRClubAudioCrowd._playClip(npc, 'Idle_Talking_Loop', npc.baseSpeed);
            VRClubAudioCrowd._playClip(partner, 'Idle_Talking_Loop', partner.baseSpeed);
            this._updateMinglerDrink(npc, 'wash');
        } else if (partner) {
            VRClubAudioCrowd._playClip(npc, 'Idle_Talking_Loop', npc.baseSpeed);
            VRClubAudioCrowd._playClip(partner, 'Idle_Talking_Loop', partner.baseSpeed);
        }
    }

    /** At the rail: he lets go, turns to the person beside him and they talk; she lets go of the rail too. */
    _minglerTurnToTalk(npc, route) {
        const state = npc.mingle;
        const node = route.nodes[state.node];
        const partner = this._mingleGuest(state.talkGuest);
        state.talkGuest = null;
        if (!partner) { this._minglerDepart(npc, route); return; }
        const talk = node.talk || route.dwell;
        state.activity = 'talk';
        state.partner = partner;
        state.attentionTime = 0;
        state.duration = state.timer = talk.min + Math.random() * (talk.max - talk.min);
        VRClubAudioCrowd._playClip(npc, 'Idle_Talking_Loop', npc.baseSpeed);
        VRClubAudioCrowd._playClip(partner, 'Idle_Talking_Loop', partner.baseSpeed);
    }

    _minglerDepart(npc, route) {
        const state = npc.mingle;
        this._updateMinglerDrink(npc, 'wash');
        state.activity = 'walk';
        state.attentionTime = 0;
        state.drinkStop = false;
        state.talkGuest = null;
        this._releaseMinglerPartner(state);
        state.node += state.dir;
        if (state.node >= route.nodes.length) { state.node = route.nodes.length - 2; state.dir = -1; }
        else if (state.node < 0) { state.node = 1; state.dir = 1; }
        state.phase = 'walk';
        VRClubAudioCrowd._playClip(npc, 'Walk', route.speed / route.walkClipSpeed);
    }

    /**
     * Keep a walking character's blob under its feet. The contact shadows are one thin-instance buffer rebuilt only
     * when the set of enabled characters changes, so a character that moves rewrites its own translation in place.
     */
    _moveContactShadow(npc) {
        const shadows = this._contactShadows;
        if (!shadows) return;
        const index = npc._shadowIndex;
        const entry = shadows.entries && shadows.entries[index];
        if (entry) {
            entry.x = npc.root.position.x;
            entry.y = npc.root.position.y + 0.02;
            entry.z = npc.root.position.z;
        }
        if (!(index >= 0) || typeof shadows.mesh.thinInstanceBufferUpdated !== 'function') return;
        const base = index * 16;
        if (base + 16 > shadows.buffer.length) return;
        shadows.buffer[base + 12] = npc.root.position.x;
        shadows.buffer[base + 13] = npc.root.position.y + 0.02;
        shadows.buffer[base + 14] = npc.root.position.z;
        shadows.mesh.thinInstanceBufferUpdated('matrix');
    }

    /**
     * Automatic quality (opt-in): every few seconds ask the pure `AdaptiveQuality` whether the last window of frames has
     * kept missing the budget, and if so lower the tier by one for this session. Entering or leaving VR, a hidden tab and
     * a tier change all start a fresh, quiet window, because the frames before them say nothing about the new mode.
     */
    _updateAutoQuality(now) {
        const FrameStats = window.FrameStats;
        if (!FrameStats || !this._frameStats) return;
        const controller = this._autoQuality || (this._autoQuality = new FrameStats.AdaptiveQuality());
        if (document.hidden || this._xrTransitioning || this._aqVR !== this.isInVRMode) {
            this._aqVR = this.isInVRMode;
            controller.pause(now);
            this._frameStats.reset();
            return;
        }
        if (now < controller.nextEval) return;
        const decision = controller.evaluate(this._frameStats.summary(this.frameBudgetMs()), now, this.graphicsTier);
        if (!decision) return;
        this.recordDiagnostic('quality', `Auto quality: ${this.graphicsTier} -> ${decision.tier} (${decision.reason})`);
        this.setGraphicsTier(decision.tier, { persist: false });
        this.showErrorMessage(`Auto quality lowered the graphics to ${decision.tier.toUpperCase()}: frames were missing the target`);
        this._frameStats.reset();
        controller.pause(now, controller.holdSeconds);
    }

    setupPerformanceMonitor() {
        // index.html has never contained an #fpsCounter element, so this lookup
        // always returned null and the whole FPS/debug overlay (including the
        // toggle wired in setupUI) was silently dead. Create the overlay here
        // instead of depending on markup that does not exist.
        this.fpsElement = document.getElementById('fpsCounter');
        if (!this.fpsElement) {
            const el = document.createElement('div');
            el.id = 'fpsCounter';
            el.setAttribute('aria-hidden', 'true');
            el.style.cssText = [
                'position:fixed', 'top:10px', 'left:10px', 'z-index:9998',
                'font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
                'color:#0f0', 'background:rgba(0,0,0,0.55)', 'padding:6px 10px',
                'border-radius:6px', 'white-space:pre', 'pointer-events:none',
                'display:none'
            ].join(';');
            document.body.appendChild(el);
            this.fpsElement = el;
        }
        this.lastTime = performance.now();
        this.frames = 0;
        this.fps = 0;
        this.drawCallsPerFrame = 0;
        // Frame-time distribution (js/frameStats.js): the once-a-second FPS above hides hitches and judder.
        this._frameStats = window.FrameStats ? new window.FrameStats.Recorder() : null;
        this._lastDrawCallCount = this.engine && this.engine._drawCalls
            ? this.engine._drawCalls.current
            : 0;
        this.debugMode = false;
    }

    updatePerformanceMonitor() {
        this.frames++;
        const now = performance.now();
        
        if (now >= this.lastTime + 1000) {
            const sampledFrames = this.frames;
            this.fps = Math.round((sampledFrames * 1000) / (now - this.lastTime));
            if (this.engine && this.engine._drawCalls && sampledFrames > 0) {
                const currentDrawCalls = this.engine._drawCalls.current;
                this.drawCallsPerFrame = Math.round(
                    (currentDrawCalls - this._lastDrawCallCount) / sampledFrames
                );
                this._lastDrawCallCount = currentDrawCalls;
            }
            this.frames = 0;
            this.lastTime = now;
            
            // Only update if element exists
            if (this.fpsElement) {
                this.fpsElement.style.display = this.debugMode ? 'block' : 'none';
                if (!this.debugMode) return;
                const color = this.fps >= 60 ? '#00ff00' : this.fps >= 30 ? '#ffff00' : '#ff0000';
                let text = `FPS: ${this.fps}`;
                
                if (this.debugMode) {
                    const pos = this.camera.position;
                    text += `\nX: ${pos.x.toFixed(1)} Y: ${pos.y.toFixed(1)} Z: ${pos.z.toFixed(1)}`;
                    text += `\nDraws: ${this.drawCallsPerFrame}`;
                    const stats = this._frameStats && this._frameStats.summary(this.frameBudgetMs());
                    if (stats && stats.frames) text += `\nframe p95 ${stats.p95} ms  p99 ${stats.p99} ms  missed ${Math.round(stats.missedShare * 100)}%`;
                    text += `\nMeshes: ${this.scene.getActiveMeshes().length}/${this.scene.meshes.length}`;
                    text += `\nMaterials: ${this.scene.materials.length}`;
                }
                
                this.fpsElement.textContent = text;
                this.fpsElement.style.color = color;
            }
        }
    }
}
window.VRClubAudioCrowd = VRClubAudioCrowd;
