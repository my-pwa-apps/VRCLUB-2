'use strict';
// The VJ desk at the DJ table: two angled touch panels either side of the DJ controller, for whoever takes over from
// the DJ. Mixed into VRClub.prototype by club_hyperrealistic.js.
//
//   left  SHOW    who runs the lights (the automatic show, or you), the resident DJ, the music, the live moments
//                 (drop, blackout, next section, tap tempo, beams to the floor, reset) and two faders
//   right LIGHTS  every fixture on or off, plus spotlight movement, aim path, projected gobo image and wall picture
//
// Every button says what it is and what it is doing now, on the panel itself (a headset shows no tooltip), and the
// panel's header always says who has the lights. The panels are one mesh each: a canvas texture redrawn only when
// something it shows changes, picked by mapping the hit point into the panel's own plane (like the VR seek bar), so a
// mouse click and a controller ray work the same way. All state changes go through the club's shared methods
// (toggleLightControl, resumeAutoShow, togglePeopleVisible, toggleAudioPlayback, the directors' macros); the desk only
// routes presses and draws what it reads.
//
// Touching any light control hands the lights to you (vjManualMode). They stay yours while you stand at the desk;
// once you walk away the usual idle timeout (VJ_TIMEOUT) hands them back, and AUTO SHOW does it at once.

const VJ_DESK = Object.freeze({
    width: 1.32,                 // metres, each panel
    depth: 0.62,                 // metres, along the slope
    tilt: Math.PI / 6,           // the far edge raised 30 degrees toward whoever stands at the desk
    centreX: 1.28,               // either side of the DJ controller (x -0.51..0.51)
    turn: 0.3,                   // each panel turned ~17 degrees toward the middle, where the operator stands
    lift: 0.03,                  // the front edge's height above the table top
    canvas: Object.freeze({ width: 1536, height: 720 }),
    // Where someone working the desk stands: on the riser, behind the decks.
    booth: Object.freeze({ x0: -3.2, x1: 3.2, z0: -20.2, z1: -17.6 }),
    redrawEvery: 0.2,            // seconds between checks for a changed panel
    pressMs: 160
});

/** The buttons, in canvas pixels. Pure data: tests read it to check the layout and the wiring. */
function vjDeskLayout() {
    const W = VJ_DESK.canvas.width, margin = 28, gap = 14, top = 140;
    const grid = (cols, rowHeights) => {
        const width = (W - margin * 2 - gap * (cols - 1)) / cols;
        const rows = [];
        let y = top;
        for (const height of rowHeights) { rows.push({ y, height }); y += height + gap; }
        return (col, row, span = 1) => ({
            x: Math.round(margin + col * (width + gap)), y: rows[row].y,
            w: Math.round(width * span + gap * (span - 1)), h: rows[row].height
        });
    };
    const show = grid(3, [112, 112, 112, 78, 78]);
    const lights = grid(4, [125, 125, 125, 125]);
    const light = (id, label, control, col, row, colour, extra = {}) =>
        ({ id, panel: 'lights', kind: 'light', label, control, colour, rect: lights(col, row), ...extra });
    return Object.freeze({
        show: Object.freeze([
            { id: 'auto', panel: 'show', kind: 'auto', label: 'AUTO SHOW', rect: show(0, 0), colour: '#19c37d' },
            { id: 'dj', panel: 'show', kind: 'dj', label: 'RESIDENT DJ', rect: show(1, 0), colour: '#7aa7ff' },
            { id: 'music', panel: 'show', kind: 'music', label: 'MUSIC', rect: show(2, 0), colour: '#7aa7ff' },
            { id: 'drop', panel: 'show', kind: 'drop', label: 'DROP', rect: show(0, 1), colour: '#ff5d7a' },
            { id: 'blackout', panel: 'show', kind: 'blackout', label: 'BLACKOUT', rect: show(1, 1), colour: '#9aa3b5' },
            { id: 'next', panel: 'show', kind: 'next', label: 'NEXT SECTION', rect: show(2, 1), colour: '#b48cff' },
            { id: 'tap', panel: 'show', kind: 'tap', label: 'TAP TEMPO', rect: show(0, 2), colour: '#ffc247' },
            { id: 'lock', panel: 'show', kind: 'lock', label: 'BEAMS TO FLOOR', rect: show(1, 2), colour: '#ffc247' },
            { id: 'reset', panel: 'show', kind: 'reset', label: 'RESET LIGHTS', rect: show(2, 2), colour: '#9aa3b5' },
            { id: 'brightness', panel: 'show', kind: 'fader', fader: 'brightness', label: 'BRIGHTNESS', rect: show(0, 3, 3), colour: '#ffffff' },
            { id: 'speed', panel: 'show', kind: 'fader', fader: 'speed', label: 'MOVEMENT SPEED', rect: show(0, 4, 3), colour: '#39d0ff' }
        ]),
        lights: Object.freeze([
            light('spots', 'SPOTS', 'lightsActive', 0, 0, '#ff8a1f'),
            light('lasers', 'LASERS', 'lasersActive', 1, 0, '#ff3048'),
            light('sheet', 'LASER SHEET', 'laserSheetActive', 2, 0, '#38e870'),
            light('mirror', 'MIRROR BALL', 'mirrorBallActive', 3, 0, '#ffd23a'),
            light('wall', 'LED WALL', 'ledWallActive', 0, 1, '#3aa0ff'),
            light('strobes', 'STROBES', 'strobesActive', 1, 1, '#f2f4ff'),
            light('smoke', 'SMOKE', 'smokeActive', 2, 1, '#b9b9ff'),
            light('flash', 'SPOT FLASH', 'spotStrobeActive', 3, 1, '#ff6ad5'),
            light('colour', 'SPOT COLOUR', 'changeColor', 0, 2, '#ff8a1f', { step: true }),
            light('moves', 'SPOT MOVES', 'cycleSpotMode', 1, 2, '#ff8a1f', { step: true }),
            light('aim', 'SPOT AIM PATH', 'cyclePattern', 2, 2, '#ff8a1f', { step: true }),
            light('gobo', 'PROJECT GOBO', 'goboActive', 3, 2, '#39e0c8'),
            light('picture', 'WALL PICTURE', 'cycleLedPattern', 0, 3, '#3aa0ff', { step: true }),
            light('mono', 'WALL B&W', 'ledMonochrome', 1, 3, '#d0d0d0'),
            light('mirrorColour', 'MIRROR COLOUR', 'changeMirrorBallColor', 2, 3, '#ffd23a', { step: true }),
            light('goboShape', 'GOBO IMAGE', 'cycleGoboPattern', 3, 3, '#39e0c8', { step: true })
        ])
    });
}

/** Where a fader's track runs inside its button rect (pixels), so pressing, dragging and drawing agree. */
function vjDeskFaderTrack(rect) {
    return { left: rect.x + 330, right: rect.x + rect.w - 170, y: rect.y + rect.h / 2 };
}

function deskRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

const deskCss = colour => {
    const c = v => Math.round(255 * Math.min(1, Math.max(0, v || 0)));
    return colour ? `rgb(${c(colour.r)}, ${c(colour.g)}, ${c(colour.b)})` : '#000';
};

const VJDesk = {
    /**
     * Build both panels on the DJ table. `top` is the table's surface height, `frontZ` its edge on the operator's side.
     */
    createVJDesk({ top, frontZ }) {
        if (!this.scene || !BABYLON.MeshBuilder || !BABYLON.DynamicTexture) return;
        const { width: W, depth: D, tilt, turn, centreX, lift } = VJ_DESK;
        const layout = vjDeskLayout();
        const housings = [];
        const panels = ['show', 'lights'].map(id => {
            const side = id === 'show' ? -1 : 1;   // the operator faces +z, so -x is on their left
            // A plane faces -z; tipping it back by (90 deg - tilt) about x lays it on the desk facing up and toward the
            // operator, with its texture's top along the far edge and its left on the operator's left. The yaw then
            // turns each panel toward the middle of the table.
            const mesh = BABYLON.MeshBuilder.CreatePlane(`vjDesk_${id}`, { width: W, height: D }, this.scene);
            mesh.rotation.set(Math.PI / 2 - tilt, side * turn, 0);
            mesh.computeWorldMatrix(true);
            const up = mesh.getDirection(BABYLON.Axis.Y);       // up the slope, toward the far edge
            const into = mesh.getDirection(BABYLON.Axis.Z);     // from the glass into the console
            const centre = new BABYLON.Vector3(side * centreX, top + lift, frontZ + 0.03).addInPlace(up.scale(D / 2));
            mesh.position.copyFrom(centre);
            mesh.isPickable = true;
            const texture = new BABYLON.DynamicTexture(`vjDeskTexture_${id}`, VJ_DESK.canvas, this.scene, true);
            texture.anisotropicFilteringLevel = 8;
            texture.hasAlpha = false;
            mesh.material = this.materialFactory.createStandardMaterial(`vjDeskMat_${id}`, {
                emissiveColor: [0, 0, 0], emissiveTexture: texture, disableLighting: true
            });
            mesh.computeWorldMatrix(true);
            mesh.freezeWorldMatrix();

            // A console body under the glass, so the desk reads as hardware from the dance floor too.
            const body = BABYLON.MeshBuilder.CreateBox(`vjDeskBody_${id}`, { width: W + 0.05, height: D + 0.05, depth: 0.05 }, this.scene);
            body.position.copyFrom(centre).addInPlace(into.scale(0.029));
            body.rotation.copyFrom(mesh.rotation);
            housings.push(body);
            return { id, mesh, texture, buttons: layout[id], signature: '' };
        });
        const housing = BABYLON.Mesh.MergeMeshes(housings, true);
        if (housing) {
            housing.name = 'vjDeskHousing';
            housing.material = this.materialFactory.getPreset('cdjBody');
            housing.isPickable = false;
            housing.freezeWorldMatrix();
        }
        this._vjDesk = { panels, housing, clock: 0, dirty: true };
        this._vjDeskDrag = null;
        this._vjDeskPressed = null;
        for (const panel of panels) this._drawVJDeskPanel(panel);
    },

    /** The panel and button under a pick, and the hit in canvas pixels; null when the pick is not on the desk. */
    _vjDeskHit(pickResult) {
        const desk = this._vjDesk;
        if (!desk || !pickResult || !pickResult.hit || !pickResult.pickedPoint) return null;
        const panel = desk.panels.find(item => item.mesh === pickResult.pickedMesh);
        if (!panel) return null;
        const local = BABYLON.Vector3.TransformCoordinates(pickResult.pickedPoint, panel.mesh.getWorldMatrix().clone().invert());
        const x = (local.x / VJ_DESK.width + 0.5) * VJ_DESK.canvas.width;
        const y = (0.5 - local.y / VJ_DESK.depth) * VJ_DESK.canvas.height;
        const button = panel.buttons.find(b => x >= b.rect.x && x <= b.rect.x + b.rect.w && y >= b.rect.y && y <= b.rect.y + b.rect.h) || null;
        return { panel, button, x, y };
    },

    /** Pointer down. Returns true when the desk took the press. */
    pressVJDesk(pickResult) {
        const hit = this._vjDeskHit(pickResult);
        if (!hit) return false;
        if (!hit.button) return true;
        const button = hit.button;
        this._vjDeskPressed = { id: button.id, until: performance.now() + VJ_DESK.pressMs };
        if (button.kind === 'fader') {
            if (this._vjDeskSetFader(button, hit.x)) this._vjDeskDrag = { panel: hit.panel, button };
        } else {
            this._runVJDeskButton(button);
        }
        if (this._vjDesk) this._vjDesk.dirty = true;
        return true;
    },

    /** Pointer move: a fader follows the pointer for as long as it stays on its panel. */
    dragVJDesk(pickResult) {
        const drag = this._vjDeskDrag;
        if (!drag) return;
        const hit = this._vjDeskHit(pickResult);
        if (!hit || hit.panel !== drag.panel) return;
        this._vjDeskSetFader(drag.button, hit.x);
        this._vjDesk.dirty = true;
    },

    releaseVJDesk() {
        this._vjDeskDrag = null;
    },

    /** Set a fader from a pixel position along its track. Returns false when the guest may not change it. */
    _vjDeskSetFader(button, x) {
        if (!this.guardHostControl('lights')) return false;
        const track = vjDeskFaderTrack(button.rect);
        const f = Math.min(1, Math.max(0, (x - track.left) / (track.right - track.left)));
        if (button.fader === 'brightness') {
            if (this.vjDirector) this.vjDirector.setMasterIntensity(f);
        } else {
            this.setLightSpeed(0.1 + f * 1.9);
        }
        this.takeLightControl();
        return true;
    },

    _runVJDeskButton(button) {
        const toast = text => this.showErrorMessage(text);
        // The resident DJ is a personal choice (who is in YOUR club); the music has its own owner check; everything
        // else changes the room's lights, which in someone else's room belong to the host.
        if (button.kind === 'dj') {
            const here = this.togglePeopleVisible('dj');
            toast(here ? 'The DJ is back at the decks' : 'The DJ has gone home: the decks are yours');
            return;
        }
        if (button.kind === 'music') { this._vjDeskMusic(); return; }
        if (!this.guardHostControl('lights')) return;
        const vj = this.vjDirector, show = this.showDirector;
        const driving = !!(show && show.isDriving());
        switch (button.kind) {
            case 'auto':
                if (!this.vjManualMode) { toast('The automatic show already has the lights'); return; }
                this.resumeAutoShow();
                toast('The automatic show has the lights again');
                return;
            case 'drop':
                if (driving) show.triggerShowDrop();
                else if (vj) vj.triggerDrop();
                return;
            case 'blackout': if (vj) vj.blackout(800); return;
            case 'next':
                if (!driving) { toast('Next section is part of the automatic show: press AUTO SHOW first'); return; }
                toast(`Next section: ${this.nextShowSection()}`);
                return;
            case 'tap': if (vj) vj.tapTempo(); return;
            case 'lock': if (vj) vj.lockToCenter(4000); return;
            case 'reset':
                this.resetVJControls();
                toast('Lights reset: the automatic show has them again');
                return;
            case 'light': this.toggleLightControl(button.control); return;
        }
    },

    /** Play or pause; with nothing loaded yet, play the user's selected saved set. */
    _vjDeskMusic() {
        if (!this.guardHostControl('music')) return;
        const audio = this.audioElement;
        if (audio && audio.src) { this.toggleAudioPlayback(); return; }
        if (this.musicLibrary && this.musicLibrary.current()) {
            Promise.resolve(this.musicLibrary.play()).catch(error => this.showErrorMessage(`Could not start the music: ${error.message}`));
        } else {
            this.showErrorMessage('No music yet: use ADD LINKS in the Music menu to save your own set.');
        }
    },

    /** Is the player standing at the desk (on the riser, behind the decks)? */
    _operatorAtVJDesk() {
        const camera = typeof this._playerCamera === 'function' ? this._playerCamera() : (this.scene && this.scene.activeCamera);
        const p = camera && (camera.globalPosition || camera.position);
        const b = VJ_DESK.booth;
        return !!p && p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1;
    },

    /** Per frame: keep the lights with whoever stands at the desk, and redraw a panel when what it shows changes. */
    updateVJDesk(ctx) {
        const desk = this._vjDesk;
        if (!desk) return;
        const now = performance.now();
        if (this.vjManualMode && this._operatorAtVJDesk()) this.lastVJInteraction = now / 1000;
        if (this._vjDeskPressed && now > this._vjDeskPressed.until) {
            this._vjDeskPressed = null;
            desk.dirty = true;
        }
        desk.clock -= (ctx && ctx.dt) || 0;
        if (desk.clock > 0 && !desk.dirty) return;
        desk.clock = VJ_DESK.redrawEvery;
        for (const panel of desk.panels) {
            const signature = this._vjDeskSignature(panel);
            if (desk.dirty || signature !== panel.signature) {
                panel.signature = signature;
                this._drawVJDeskPanel(panel);
            }
        }
        desk.dirty = false;
    },

    /** Who has the lights, in words, for the SHOW panel's header. */
    _vjDeskStatus() {
        if (this.isFollowingHost()) {
            const host = (this.multiplayer.hostName() || 'The host').toUpperCase();
            return { tone: 'host', title: `${host} HAS THE LIGHTS`, detail: 'THEIR ROOM, THEIR SHOW. THE DJ BUTTON IS STILL YOURS.' };
        }
        if (this.vjManualMode) {
            const hold = this.lightHold || { mode: 'resume' };
            let detail = 'PRESS AUTO SHOW TO HAND THE LIGHTS BACK';
            if (hold.mode === 'keep') {
                detail = 'KEPT AS YOU SET THEM. PRESS AUTO SHOW TO HAND THEM BACK';
            } else if (hold.mode === 'shuffle') {
                detail = `COLOURS SHUFFLE EVERY ${hold.shuffle} S. PRESS AUTO SHOW TO HAND BACK`;
            } else if (!this._operatorAtVJDesk()) {
                const handBack = typeof this.lightHandBackSeconds === 'function' ? this.lightHandBackSeconds() : this.VJ_TIMEOUT;
                const left = Math.max(0, Math.ceil(handBack - (performance.now() / 1000 - (this.lastVJInteraction || 0))));
                detail = `YOU LEFT THE DESK: THE AUTOMATIC SHOW TAKES OVER IN ${left} S`;
            }
            return { tone: 'manual', title: 'YOU ARE THE VJ', detail };
        }
        const show = this.showDirector;
        if (show && show.enabled) {
            const movement = show.movements && show.movements[show._movementName];
            const title = movement && movement.title ? movement.title.toUpperCase() : '';
            if (typeof show.isHeld === 'function' && show.isHeld()) {
                const left = show.holdSecondsLeft();
                return { tone: 'auto', title: 'AUTOMATIC SHOW', detail: `HOLDING ${title || 'THIS SECTION'}${left === null ? ' UNTIL YOU PRESS AUTO SHOW' : `: CARRIES ON IN ${left} S`}.` };
            }
            return { tone: 'auto', title: 'AUTOMATIC SHOW', detail: `NOCTURNE${title ? `: ${title}` : ''}. TOUCH ANY CONTROL TO TAKE OVER.` };
        }
        return { tone: 'auto', title: 'AUTOMATIC SHOW', detail: 'CLASSIC LIGHT CYCLE. TOUCH ANY CONTROL TO TAKE OVER.' };
    },

    /** Why a button cannot do anything right now, or '' when it can. */
    _vjDeskDisabledReason(button) {
        if (button.kind === 'dj') return '';
        if (this.isFollowingHost()) return 'HOST ONLY';
        if (this.photosensitiveSafeMode && (button.control === 'strobesActive' || button.control === 'spotStrobeActive')) return 'SAFE MODE';
        if (button.kind === 'next' && !(this.showDirector && this.showDirector.isDriving())) return 'AUTO SHOW ONLY';
        return '';
    },

    /** What a button shows now: its second line, whether it is lit, and a colour swatch where it has one. */
    _vjDeskButtonState(button) {
        const disabled = this._vjDeskDisabledReason(button);
        const out = { value: '', active: false, disabled: !!disabled, swatch: null };
        const onOff = on => { out.active = !!on; out.value = on ? 'ON' : 'OFF'; };
        const vj = this.vjDirector;
        switch (button.kind) {
            case 'auto':
                out.active = !this.vjManualMode;
                out.value = out.active ? 'RUNNING' : 'TAP TO HAND BACK';
                break;
            case 'dj': {
                const here = this.isPeopleVisible('dj');
                out.active = here;
                out.value = here ? 'PLAYING' : 'SENT HOME';
                break;
            }
            case 'music': {
                const info = this.getPlaybackInfo();
                const loaded = !!(this.audioElement && this.audioElement.src);
                out.active = info.playing;
                out.value = !loaded ? 'TAP TO START A SET' : info.playing ? 'PLAYING' : 'PAUSED';
                break;
            }
            case 'drop': out.value = this.showDirector && this.showDirector.isDriving() ? 'COUNTDOWN, THEN DROP' : 'PEAK LOOK NOW'; break;
            case 'blackout': out.value = 'ALL DARK, ONE MOMENT'; break;
            case 'next': {
                const show = this.showDirector;
                const movement = show && show.movements && show.movements[show._movementName];
                out.value = movement && movement.title ? `NOW: ${movement.title.toUpperCase()}` : 'NEXT PART OF THE SHOW';
                break;
            }
            case 'tap': out.value = `TAP ON THE BEAT: ${Math.round((vj && vj.bpm) || this.vjBPM || 120)} BPM`; break;
            case 'lock': out.value = 'ALL HEADS DOWN, 4 S'; break;
            case 'reset': out.value = 'DEFAULTS + AUTO SHOW'; break;
            case 'fader':
                if (button.fader === 'brightness') {
                    const level = vj && Number.isFinite(vj.targetMasterIntensity) ? vj.targetMasterIntensity : 1;
                    out.level = level;
                    out.value = `${Math.round(level * 100)}%`;
                } else {
                    const speed = this.spotlightSpeed || 1;
                    out.level = (speed - 0.1) / 1.9;
                    out.value = `${speed.toFixed(1)}x`;
                }
                break;
            case 'light':
                switch (button.control) {
                    case 'changeColor': out.value = 'NEXT COLOUR'; out.swatch = deskCss(this.currentSpotColor); break;
                    case 'changeMirrorBallColor': out.value = 'NEXT COLOUR'; out.swatch = deskCss(this.mirrorBallSpotlightColor || (this.mirrorBallColors && this.mirrorBallColors[this.mirrorBallColorIndex || 0])); break;
                    case 'cycleSpotMode': out.value = VRClubUI.SPOT_MODE_NAMES[this.spotlightMode || 0] || ''; break;
                    case 'cyclePattern': out.value = VRClubUI.SPOT_PATTERN_NAMES[this.spotlightPattern || 0] || ''; break;
                    case 'cycleGoboPattern': {
                        const name = (this.goboPatterns && this.goboPatterns[this.goboPatternIndex || 0]) || 'circle';
                        out.value = name === 'circle' ? 'OPEN' : String(name).toUpperCase();
                        break;
                    }
                    case 'cycleLedPattern': {
                        const count = this._ledPatternPlaylist ? this._ledPatternPlaylist.length : 20;
                        out.value = `${((this.ledPattern || 0) % count) + 1} OF ${count}`;
                        break;
                    }
                    case 'goboActive': onOff(this.goboEnabled); break;
                    default: onOff(this[button.control]);
                }
                break;
        }
        if (disabled) out.value = disabled;
        out.pressed = !!(this._vjDeskPressed && this._vjDeskPressed.id === button.id);
        return out;
    },

    _vjDeskSignature(panel) {
        let signature = panel.id === 'show' ? JSON.stringify(this._vjDeskStatus()) : String(this.vjManualMode);
        for (const button of panel.buttons) {
            const s = this._vjDeskButtonState(button);
            signature += `|${s.value}${s.active ? 1 : 0}${s.disabled ? 1 : 0}${s.pressed ? 1 : 0}${s.swatch || ''}${s.level == null ? '' : s.level.toFixed(3)}`;
        }
        return signature;
    },

    _drawVJDeskPanel(panel) {
        const ctx = panel.texture.getContext();
        const { width: W, height: H } = VJ_DESK.canvas;
        ctx.fillStyle = '#06080d';
        ctx.fillRect(0, 0, W, H);
        ctx.textBaseline = 'middle';

        // Header: who has the lights (SHOW), what the panel is for (LIGHTS).
        const status = panel.id === 'show' ? this._vjDeskStatus() : null;
        const tone = status ? status.tone : (this.isFollowingHost() ? 'host' : this.vjManualMode ? 'manual' : 'auto');
        const toneColour = { auto: '#19c37d', manual: '#ffb020', host: '#8a93a6' }[tone];
        deskRoundRect(ctx, 28, 16, W - 56, 108, 18);
        ctx.fillStyle = '#10151f';
        ctx.fill();
        ctx.fillStyle = toneColour;
        deskRoundRect(ctx, 28, 16, 16, 108, 8);
        ctx.fill();
        ctx.textAlign = 'left';
        ctx.fillStyle = toneColour;
        ctx.font = 'bold 50px sans-serif';
        ctx.fillText(status ? status.title : 'LIGHTS', 68, 50, W - 120);
        ctx.fillStyle = '#c3cad6';
        ctx.font = 'bold 28px sans-serif';
        ctx.fillText(status ? status.detail : 'TOUCH A LIGHT TO SWITCH IT ON OR OFF, OR TO STEP TO THE NEXT ONE', 68, 98, W - 120);

        for (const button of panel.buttons) this._drawVJDeskButton(ctx, button, this._vjDeskButtonState(button));
        panel.texture.update();
    },

    _drawVJDeskButton(ctx, button, state) {
        const { x, y, w, h } = button.rect;
        const colour = button.colour;
        const lit = state.active && !state.disabled;
        deskRoundRect(ctx, x, y, w, h, 16);
        ctx.fillStyle = state.disabled ? '#11141b' : lit ? colour : '#151b26';
        ctx.fill();
        if (state.pressed) {
            ctx.fillStyle = 'rgba(255,255,255,0.35)';
            ctx.fill();
        }
        ctx.lineWidth = lit ? 3 : 5;
        ctx.strokeStyle = state.disabled ? '#2a2f3a' : lit ? 'rgba(255,255,255,0.75)' : colour;
        ctx.stroke();

        const ink = state.disabled ? '#5f6673' : lit ? '#0a0e15' : '#ffffff';
        const sub = state.disabled ? '#6f7683' : lit ? 'rgba(10,14,21,0.8)' : colour;
        if (button.kind === 'fader') {
            const track = vjDeskFaderTrack(button.rect);
            ctx.textAlign = 'left';
            ctx.fillStyle = ink;
            ctx.font = 'bold 36px sans-serif';
            ctx.fillText(button.label, x + 26, y + h / 2, 290);
            deskRoundRect(ctx, track.left, track.y - 10, track.right - track.left, 20, 10);
            ctx.fillStyle = '#273042';
            ctx.fill();
            const level = Math.min(1, Math.max(0, state.level || 0));
            const knob = track.left + level * (track.right - track.left);
            if (!state.disabled) {
                deskRoundRect(ctx, track.left, track.y - 10, Math.max(20, knob - track.left), 20, 10);
                ctx.fillStyle = colour;
                ctx.fill();
            }
            deskRoundRect(ctx, knob - 18, y + 10, 36, h - 20, 9);
            ctx.fillStyle = state.disabled ? '#3a404c' : '#e9eef7';
            ctx.fill();
            ctx.textAlign = 'right';
            ctx.fillStyle = state.disabled ? sub : '#ffffff';
            ctx.font = 'bold 36px sans-serif';
            ctx.fillText(state.value, x + w - 24, y + h / 2, 140);
            return;
        }
        const swatch = state.swatch && !state.disabled;
        const textWidth = w - (swatch ? 92 : 36);
        ctx.textAlign = 'left';
        ctx.fillStyle = ink;
        ctx.font = 'bold 40px sans-serif';
        ctx.fillText(button.label, x + 20, y + h * 0.36, textWidth);
        ctx.fillStyle = sub;
        ctx.font = 'bold 27px sans-serif';
        ctx.fillText(state.value, x + 20, y + h * 0.74, textWidth);
        if (swatch) {
            deskRoundRect(ctx, x + w - 66, y + h / 2 - 24, 48, 48, 10);
            ctx.fillStyle = state.swatch;
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
        }
    }
};

window.VJDesk = VJDesk;
// The layout and geometry, for tests and tools (kept off VRClub.prototype, which only takes the methods above).
window.VJDeskLayout = Object.freeze({ buttons: vjDeskLayout(), config: VJ_DESK, faderTrack: vjDeskFaderTrack });
