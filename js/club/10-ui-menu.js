'use strict';
const VR_MUSIC_ACTIONS = new Set(['seek', 'playPause', 'play', 'pause', 'stop', 'sourceStep', 'folderMode',
    'savedSet', 'setStep', 'musicSetup']);

class VRClubMenu extends window.VRClubControls {

    _drawVRQuickMenuButton(button) {
        const context = button.texture.getContext();
        const active = this._isVRQuickMenuButtonActive(button);
        const disabled = this._isVRButtonDisabled(button);
        context.clearRect(0, 0, 512, 192);
        const isNavigation = ['page', 'back', 'seek', 'randomEpisode', 'latestEpisode', 'person'].includes(button.action);
        const isDanger = button.danger === true;
        // A button that cannot do anything here (a guest's lighting, the mic before joining a room) is drawn
        // flat and grey, so it reads as unavailable before anyone points at it. Its second line says why.
        context.fillStyle = disabled ? '#16191f'
            : button.action === 'close' ? '#641f2c'
            : isDanger ? '#7a2434'
            : button.action === 'quality' ? '#5b3fa3'
            : isNavigation ? '#173e58'
            : (active ? '#087f75' : '#252a35');
        context.fillRect(0, 0, 512, 192);
        if (!disabled) {
            const gradient = context.createLinearGradient(0, 0, 512, 192);
            gradient.addColorStop(0, 'rgba(255,255,255,0.10)');
            gradient.addColorStop(0.5, 'rgba(255,255,255,0)');
            gradient.addColorStop(1, 'rgba(0,0,0,0.18)');
            context.fillStyle = gradient;
            context.fillRect(0, 0, 512, 192);
        }
        context.strokeStyle = disabled ? '#343a46' : active || isNavigation ? '#8fffee' : '#6f7787';
        context.lineWidth = disabled ? 4 : 8;
        context.strokeRect(4, 4, 504, 184);
        context.fillStyle = disabled ? '#6b7280' : '#ffffff';
        context.font = 'bold 44px sans-serif';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        const value = this._vrQuickMenuButtonValue(button, active);
        if (button.swatch) {
            context.fillText(button.label, 218, value ? 66 : 96, 392);
            context.fillStyle = button.swatch;
            context.fillRect(438, 51, 46, 82);
            context.strokeStyle = '#ffffff';
            context.lineWidth = 4;
            context.strokeRect(438, 51, 46, 82);
        } else {
            context.fillText(button.label, 256, value ? 66 : 96, 480);
        }
        if (value) {
            context.fillStyle = disabled ? '#8a919e' : active ? '#d2fff9' : '#d5dae3';
            // The second line (ON / OFF, the current value, why a button is unavailable) is what a guest checks most: it was
            // 32 px on a 192 px button, small enough to be unreadable at arm's length in a headset.
            let size = 40;
            context.font = `bold ${size}px sans-serif`;
            while (size > 28 && context.measureText(value).width > 470) context.font = `bold ${--size}px sans-serif`;
            context.fillText(value, 256, 136, 480);
        }
        button.texture.update();
    }

    /** Can this button do nothing right now? (It still answers a press, with a message saying why.) */
    _isVRButtonDisabled(button) {
        if (['phonePair', 'phoneTransfer'].includes(button.action)) return window.VRPayment?.phoneCompanionAvailable === false || !!this._phoneTransferBusy;
        if (this.liveInput?.active && VR_MUSIC_ACTIONS.has(button.action)) {
            return !['stop', 'musicSetup'].includes(button.action);
        }
        if (this.multiplayer?.hasLiveEvent && VR_MUSIC_ACTIONS.has(button.action)) return true;
        if (this.isFollowingHost() && this._isHostOwnedVRButton(button)) return true;
        if (button.action === 'vrMsaa4x') return !this.isVRMsaa4xEnabled() && !this.canUseVRMsaa4x();
        if (button.action === 'renderExperiment') {
            return !this.isRenderExperimentEnabled(button.experiment) && !this.canUseRenderExperiment(button.experiment);
        }
        // The time belongs to RETURN TO AUTO and SHUFFLE COLOURS; KEEP IT has none.
        if (button.action === 'holdTiming') return this.lightHold.mode === 'keep';
        if (button.action === 'holdLook') return !!this.showLookHoldUnavailableReason();
        if (button.action !== 'net' && button.action !== 'person') return false;
        const mp = this._multiplayer();
        if (!mp) return true;
        if (button.op?.startsWith('event')) {
            if (!mp.connected || !mp.client.liveEventsSupported) return true;
            if (mp.liveEventBusy && button.op !== 'eventListen') return true;
            if (button.op === 'eventCreate') return !mp.isHost() || mp.hasLiveEvent;
            if (['eventRotate', 'eventEnd', 'eventDJ'].includes(button.op)) return !mp.hasLiveEvent || !mp.liveEvent.canManage;
            return !mp.hasLiveEvent;
        }
        if (button.op === 'joinListedRoom') return !!(button.locked || button.full || mp.roomDirectory.loading || mp.connecting);
        if (button.op === 'browseRooms' || button.op === 'moreRooms') return mp.roomDirectory.loading;
        if (button.op === 'safetyInfo') return true;
        if (['audienceClear', 'audiencePeer'].includes(button.op) && !mp.canRestrictAudience()) return true;
        const needsRoom = ['mic', 'avatar', 'gesture', 'emoji', 'phrase', 'muteAll', 'leave'];
        if (needsRoom.includes(button.op) && !mp.connected) return true;
        if (button.op === 'lock' && !mp.isHost()) return true;
        if (button.op === 'peerHost' && (!mp.connected || !mp.isHost() || !mp.client.hostTransferSupported || !mp.client.peers.has(button.peer))) return true;
        if (button.op === 'peerModerator' && (!mp.connected || !mp.isHost() || !mp.client.moderatorRoleSupported || !mp.client.peers.has(button.peer))) return true;
        if (['peerKick', 'peerBan'].includes(button.op) && (!mp.canModerate() || button.peer === mp.client.hostId || !mp.client.peers.has(button.peer))) return true;
        if (button.op === 'unblockAll' && !mp.blockedList().length) return true;
        return false;
    }

    _isVRQuickMenuButtonActive(button) {
        if (button.op) return this._vrNetActive(button);
        if (button.action === 'spotGroup') return (this._spotEditTarget || 0) === button.group;
        if (button.action === 'pickCharacter') return !this.isCustomAvatarSelected?.() && this.getLocalCharacter() === button.character;
        if (button.action === 'customAvatar') return !!this.isCustomAvatarSelected?.();
        if (button.action === 'vrMsaa4x') return this.isVRMsaa4xEnabled();
        if (button.action === 'renderExperiment') return this.isRenderExperimentEnabled(button.experiment);
        if (button.action === 'people') {
            return VRClubCore.peopleCategories(button.people).every(name => this.isPeopleVisible(name));
        }
        if (button.action === 'autoShow') return !this.vjManualMode;
        if (button.action === 'holdLook') return !!this.showDirector?.isHeld();
        if (button.action === 'dj') return (this._djWanted || this._djId || this._initialDJId()) === button.dj;
        if (button.action === 'playPause' || button.action === 'play') return this.getPlaybackInfo().playing;
        if (button.action === 'showSection') {
            return !!(this.showDirector && this.showDirector._movementName === button.section);
        }
        if (button.action === 'folderMode') {
            return this._localPlaylist ? !!this._localPlaylist.shuffle : !!this._localPlaylistShuffle;
        }
        if (button.action === 'quality' || button.action === 'cycle' || button.action === 'nextSection' ||
            button.action === 'holdMode' || button.action === 'holdTiming') return true;
        if (button.control) return !!this[button.control];
        return false;
    }

    /** Buttons that change the room's music or lights: in someone else's room they belong to the host. */
    _isHostOwnedVRButton(button) {
        if (['cycleSpotTarget', 'toggleReducedShowSmoke'].includes(button.control)) return false;
        if (button.action === 'characterStyle') return true;
        if (this.multiplayer?.canControlLights?.() && !VR_MUSIC_ACTIONS.has(button.action)) return false;
        if (button.action === 'showMood' && button.value === 'gashouder' && this.venueId !== 'gashouder') return false;
        if (VR_MUSIC_ACTIONS.has(button.action) ||
            ['autoShow', 'holdLook', 'reset', 'cycle', 'nextSection', 'showDrop', 'showPeak', 'showSection', 'showMood', 'showBlackout'].includes(button.action)) return true;
        return !!button.control && !button.action && !['vrComfortMode', 'vrSeatedMode', 'autoQuality', 'photosensitiveSafeMode'].includes(button.control);
    }

    _vrQuickMenuButtonValue(button, active) {
        if (button.action === 'creditText') return button.detail;
        if (button.action === 'voiceClarity') return this.getVoiceClarityMode?.() === 'nearby' ? 'NEARBY: GENTLE LOCAL DUCKING' : 'STANDARD: STRONGER DUCKING';
        if (button.action === 'postcardCapture') return this._postcardCapturing ? 'CAPTURING...' : 'LOCAL STILL; NO NAMES OR CHAT';
        if (button.action === 'postcardSave') return this._postcardUrl ? 'SAVE TO THIS DEVICE' : 'TAKE A PHOTO FIRST';
        if (button.action === 'showMood') return this.showDirector?.program === button.value && !this.vjManualMode ? 'PLAYING' : 'RESUME AUTOMATIC SHOW';
        if (['cycleShowProgram', 'cycleSheetSpeed', 'toggleReducedShowSmoke'].includes(button.control) ||
            Object.hasOwn(VRClubUI.FIXTURE_BRIGHTNESS_CONTROLS, button.control)) {
            return this.isFollowingHost() && this._isHostOwnedVRButton(button) ? 'HOST ONLY' : this.aestheticControlValue(button.control);
        }
        if (button.action === 'spotGroup') return active ? 'SELECTED' : 'TAP TO EDIT';
        if (this.liveInput?.active && VR_MUSIC_ACTIONS.has(button.action)) {
            return button.action === 'stop' ? 'STOP INPUT' : button.action === 'musicSetup' ? 'LIVE INPUT SETUP' : 'MIXER INPUT';
        }
        if (this.multiplayer?.hasLiveEvent && VR_MUSIC_ACTIONS.has(button.action)) return 'LIVE EVENT DJ';
        if (Object.prototype.hasOwnProperty.call(VRClubUI.SPOT_RIG_CONTROLS, button.control)) {
            return this.isFollowingHost() && !this.multiplayer?.canControlLights?.() && button.control !== 'cycleSpotTarget' ? 'HOST ONLY' : this.spotRigControlValue(button.control);
        }
        if (button.action === 'lightweightCharacters') return this.characterStyleStatus().lightweight ? 'ON: STANDARD FOR ME' : 'OFF: FOLLOW ROOM STYLE';
        if (button.action === 'characterStyle') {
            const state = this.characterStyleStatus();
            return this.isFollowingHost() ? 'HOST CHOOSES' : state.loading ? 'LOADING...' : state.selected === 'diverse' ? 'DETAILED: MORE CPU/GPU' : 'STANDARD: LIGHTWEIGHT';
        }
        if (button.op || button.action === 'person') return this._vrNetValue(button, active);
        if (button.action === 'people') {
            if (button.people === 'dj' && this._roomDJVisible === false) return 'HOST SENT DJ HOME';
            return active ? 'HERE' : 'SENT HOME';
        }
        if (button.action === 'welcomeSafe') return 'NO STROBES';
        if (button.action === 'welcomeFull') return 'STROBES ON';
        if (button.action === 'accessNewCode') return 'IF THIS ONE FAILED';
        if (button.action === 'accessExit') return 'CLOSES NOCTURNE';
        if (button.action === 'musicSync') return this._immersive ? this._immersive.musicStatus : '';
        if (this.isFollowingHost() && this._isHostOwnedVRButton(button)) return 'HOST ONLY';
        if (button.action === 'dj') return active ? 'SELECTED' : '';
        if (button.action === 'savedSet') {
            const item = this.musicLibrary && this.musicLibrary.current();
            return item ? item.name.slice(0, 22).toUpperCase() : 'ADD LINKS FIRST';
        }
        if (button.action === 'playPause') return active ? 'PLAYING' : 'PAUSED';
        if (button.action === 'play') return active ? 'PLAYING' : 'READY';
        if (button.action === 'pause') return this.getPlaybackInfo().playing ? 'TAP TO PAUSE' : 'PAUSED';
        if (button.action === 'stop') return this._audioKind ? 'RETURN TO START' : 'NOTHING LOADED';
        if (button.action === 'folderMode') {
            const playlist = this._localPlaylist;
            const shuffle = playlist ? playlist.shuffle : !!this._localPlaylistShuffle;
            if (!playlist) return `${shuffle ? 'SHUFFLE' : 'IN ORDER'} \u2022 NEXT FOLDER`;
            return `${shuffle ? 'SHUFFLE' : 'IN ORDER'} \u2022 ${playlist.files.length} TRACKS`;
        }
        // These two leave the immersive session for an on-screen page (a headset has no keyboard): say so before the press.
        if (button.action === 'musicSetup') return 'LEAVES VR';
        if (['phoneOpen', 'phonePair', 'phoneTransfer'].includes(button.action) && window.VRPayment?.phoneCompanionAvailable === false) return 'UNAVAILABLE ON QUESTDEV';
        if (button.action === 'phonePair') return this._phonePairCode || 'EIGHT-DIGIT VERIFIED PAIRING';
        if (button.action === 'phoneTransfer') return this._phoneTransferBusy ? 'WORKING...' :
            this._phoneConfirm?.operation === button.operation && performance.now() < this._phoneConfirm.until
                ? 'PRESS AGAIN TO REPLACE' : button.operation === 'music' ? 'KEEP CURRENT PLAYBACK' : 'CHECK FIRST; CONFIRM REPLACEMENT';
        if (button.action === 'measureHeight') {
            return this._heightMeasure ? 'MEASURING...'
                : this.playerEyeHeight ? `EYES ${this.playerEyeHeight.toFixed(2)} M` : 'STAND TALL, TAP';
        }
        if (button.action === 'pickCharacter') return button.detail || '';
        if (button.action === 'customAvatar') return active ? 'IN USE: TAP FOR CLUB CHARACTER' : 'TAP TO USE YOUR MODEL';
        if (button.action === 'customSharing') return this.customAvatarSharingStatus().enabled ? 'SHARING ENABLED' : 'SHARING OFF';
        if (button.action === 'page' && button.target === 'character') {
            if (this.isCustomAvatarSelected?.()) return 'UPLOADED AVATAR';
            const id = this.getLocalCharacter();
            return id ? String(this.characterLabel(id)).toUpperCase().slice(0, 28) : (this.getLocalAvatarStyle() === 'male' ? 'DEFAULT MAN' : 'DEFAULT WOMAN');
        }
        if (button.control === 'autoQuality') return this.autoQuality ? 'ON \u2022 STEPS DOWN IF SLOW' : 'OFF';
        if (button.control === 'vrSeatedMode') return this.vrSeatedMode ? 'ON \u2022 AVATAR STANDS' : 'OFF';
        if (button.action === 'quality') return this.graphicsTier.toUpperCase();
        if (button.action === 'vrMsaa4x') {
            if (!this.canUseVRMsaa4x()) return active ? 'UNAVAILABLE \u2022 TAP TO CLEAR' : 'NOT AVAILABLE';
            return active ? 'ON \u2022 MAY REDUCE FPS' : 'OFF \u2022 MAY REDUCE FPS';
        }
        if (button.action === 'renderExperiment') {
            if (!this.canUseRenderExperiment(button.experiment)) return active ? 'UNAVAILABLE \u2022 TAP TO CLEAR' : 'NOT AVAILABLE';
            if (button.experiment !== 'anisotropy' && active !== this._renderExperiments[button.experiment]) {
                return `${active ? 'ON' : 'OFF'} \u2022 RELOAD TO APPLY`;
            }
            return active ? 'ON \u2022 MAY REDUCE FPS' : 'OFF \u2022 MAY REDUCE FPS';
        }
        if (button.action === 'cycle' && button.control === 'cycleLedPattern') {
            return `PATTERN ${(this.ledPattern || 0) + 1}`;
        }
        if (button.action === 'cycle' && button.control === 'changeColor') {
            return `COLOUR ${(this.spotColorIndex || 0) + 1}`;
        }
        if (button.action === 'cycle' && button.control === 'changeLaserColor') {
            return ['RED', 'GREEN', 'BLUE'][this.currentColorIndex || 0];
        }
        if (button.action === 'cycle' && button.control === 'matchAllColors') {
            return this.colorLockActive ? 'MATCHED' : 'TAP TO MATCH';
        }
        if (button.action === 'cycle' && button.control === 'changeMirrorBallColor') {
            return `COLOUR ${(this.mirrorBallColorIndex || 0) + 1}`;
        }
        if (button.action === 'cycle' && button.control === 'cycleSpotMode') {
            return `MODE ${(this.spotlightMode || 0) + 1}`;
        }
        if (button.action === 'cycle' && button.control === 'cyclePattern') {
            return VRClubUI.SPOT_PATTERN_NAMES[this.spotlightPattern || 0] || '';
        }
        if (button.action === 'cycle' && button.control === 'cycleStrobePattern') {
            return VRClubAnimationFinish.STROBE_PATTERN_NAMES[this.strobePattern] || 'ALL AT ONCE';
        }
        if (button.control === 'cycleFogMode' || button.control === 'cycleFogAmount') {
            return this.smokeControlValue(button.control);
        }
        if (button.action === 'holdMode') return VRClubUI.LIGHT_HOLD_NAMES[this.lightHold.mode];
        if (button.action === 'holdTiming') {
            const hold = this.lightHold;
            if (hold.mode === 'keep') return 'NOT NEEDED';
            return VRClubUI.lightHoldSecondsName(hold.mode === 'shuffle' ? hold.shuffle : hold.delay);
        }
        if (button.action === 'nextSection') {
            const status = this.showDirector && this.showDirector.getStatus();
            return status ? String(status.movement).slice(0, 22) : '';
        }
        if (button.action === 'showDrop') {
            return this.showDirector && this.showDirector.isDriving() ? 'COUNTDOWN, THEN DROP' : 'PEAK LOOK NOW';
        }
        if (button.action === 'showSection') {
            const held = this.showDirector && this.showDirector.isHeld && this.showDirector.isHeld();
            return active ? (held ? 'PLAYING \u2022 KEPT' : 'PLAYING') : 'TAP TO JUMP HERE';
        }
        if (button.action === 'holdLook') return this.showLookHoldUnavailableReason() || (active ? 'HELD: PRESS TO RELEASE' : 'MOVEMENT KEEPS RUNNING');
        if (button.action === 'autoShow') return this.showDirector?.isHeld() ? 'RELEASE HELD LOOK' : active ? 'ON' : 'MANUAL';
        if (button.control) return active ? 'ON' : 'OFF';
        return '';
    }

    /**
     * The character picker: nine buttons a page (women and the default first, then men), the current one lit, a button to flip
     * the page, BACK and CLOSE. Each button names the kind of person and, beneath, what they wear; it replaced stepping
     * blindly through seventeen people with NEXT.
     */
    _vrCharacterPageDefinitions(common) {
        const Crowd = window.VRClubAudioCrowd;
        const labels = (window.ClubMultiplayer && window.ClubMultiplayer.AVATAR_LABELS) || {};
        const ids = Crowd ? Crowd.MY_CHARACTERS : [];
        const second = this._vrCharacterPage === 1;
        const entry = id => {
            const [kind, ...rest] = String(this.characterLabel ? this.characterLabel(id) : labels[id] || id).split(',').map(part => part.trim());
            return { label: kind.toUpperCase(), detail: rest.join(', ').toUpperCase(), action: 'pickCharacter', character: id };
        };
        const buttons = second
            ? ids.filter(id => id[0] === 'm').map(entry)
            : [{ label: 'DEFAULT', detail: this.multiplayer?.connected ? 'RANDOM ROOM CHARACTER' : 'YOUR OWN BODY',
                action: 'pickCharacter', character: null }, ...ids.filter(id => id[0] === 'f').map(entry)];
        while (buttons.length < 9) buttons.push(null);
        return [
            ...buttons.slice(0, 9),
            common.back,
            { label: second ? '\u2190 WOMEN' : 'MEN \u2192', action: 'characterPage' },
            common.close
        ];
    }

    _vrQuickMenuPageDefinitions(page) {
        const common = {
            back: { label: '\u2190 BACK', action: 'back' },
            close: { label: 'CLOSE', action: 'close' }
        };
        if (VRClubUI.VR_NET_PAGES.includes(page)) return this._vrNetPageDefinitions(page, common);
        const mp = this._multiplayer();
        if (page === 'credits') return this._vrCreditsDefinitions(common);
        // In a room, talking and reacting come first: one press to the mic, the emoji or a quick message.
        const social = mp && mp.connected ? [
            { label: 'TALK', action: 'net', op: 'mic' },
            { label: 'REACT', action: 'page', target: 'gestures' },
            { label: 'CHAT', action: 'page', target: 'chat', op: 'chatUnread' }
        ] : [];
        const pages = {
            home: [
                ...social,
                { label: 'MUSIC', action: 'page', target: 'music' },
                { label: 'SHOW', action: 'page', target: 'show' },
                // Who is in the club gets its own page: it used to sit at the bottom of COMFORT, where nobody found it.
                { label: 'CROWD', action: 'page', target: 'crowd' },
                { label: 'ONLINE', action: 'page', target: 'online' },
                { label: 'TRAVEL', action: 'page', target: 'travel' },
                { label: 'COMFORT', action: 'page', target: 'comfort' },
                { label: 'WARDROBE', action: 'page', target: 'me' },
                ...(!social.length || !this._immersive?.needsAccess()
                    ? [{ label: 'CAMERA', action: 'page', target: 'camera' }] : []),
                // A headset in its free preview (or waiting to be paired) can always get back to its pairing code.
                ...(this._immersive && this._immersive.needsAccess() ? [{ label: 'ACCESS', action: 'page', target: 'access' }] : []),
                common.close
            ],
            // Immersive launch (js/immersiveLaunch.js): the first-run photosensitivity choice, and the headset pairing code.
            welcome: [
                { label: 'SAFE MODE', action: 'welcomeSafe' },
                { label: 'FULL LIGHTS', action: 'welcomeFull' }
            ],
            camera: [
                { label: 'TAKE PHOTO', action: 'postcardCapture' },
                { label: 'SAVE PHOTO', action: 'postcardSave' },
                { label: 'COPY ROOM INVITE', action: 'postcardInvite' },
                common.back, common.close
            ],
            access: [
                { label: 'NEW CODE', action: 'accessNewCode' },
                this._immersive && this._immersive.mode === 'locked'
                    ? { label: 'EXIT VR', action: 'accessExit' }
                    : { label: 'BACK TO CLUB', action: 'back', target: 'home' }
            ],
            lights: [
                { label: 'SPOTS', control: 'lightsActive' },
                { label: 'LASERS', control: 'lasersActive' },
                { label: 'LASER SHEET', control: 'laserSheetActive' },
                { label: 'MIRROR BALL', control: 'mirrorBallActive' },
                { label: 'SPOT COLOUR', control: 'changeColor', action: 'cycle' },
                { label: 'LASER COLOUR', control: 'changeLaserColor', action: 'cycle' },
                { label: 'MIRROR COLOUR', control: 'changeMirrorBallColor', action: 'cycle' },
                { label: 'MATCH ALL COLOURS', control: 'matchAllColors', action: 'cycle' },
                { label: 'SPOT RIG', target: 'spotRig', action: 'page' },
                { label: 'BRIGHTNESS / SHEET', target: 'sheetSettings', action: 'page' },
                common.back,
                common.close
            ],
            spotRig: [
                { label: 'CHOOSE SPOTS', control: 'cycleSpotTarget', action: 'page', target: 'spotGroups' },
                ...Object.entries(VRClubUI.SPOT_RIG_CONTROLS).filter(([control]) => control !== 'cycleSpotTarget')
                    .map(([control, label]) => ({ label, control, action: 'cycle' })),
                { label: 'SPOT MODE', control: 'cycleSpotMode', action: 'cycle' },
                { label: 'SPOT AIM PATH', control: 'cyclePattern', action: 'cycle' },
                common.back, common.close
            ],
            spotGroups: [
                ...VRClubUI.SPOT_GROUPS.slice(0, 6).map(({ name: label }, group) => ({ label, group, action: 'spotGroup' })),
                { label: 'INDIVIDUAL SPOTS', action: 'page', target: 'spotHeads' }, common.back, common.close
            ],
            spotHeads: [
                ...VRClubUI.SPOT_GROUPS.slice(6).map(({ name: label }, index) => ({ label, group: index + 6, action: 'spotGroup' })),
                common.back, common.close
            ],
            effects: [
                { label: 'STROBES', control: 'strobesActive' },
                { label: 'STROBE PATTERN', control: 'cycleStrobePattern', action: 'cycle' },
                { label: 'SPOT STROBE', control: 'spotStrobeActive' },
                { label: 'SMOKE', control: 'smokeActive' },
                { label: 'LED WALL', control: 'ledWallActive' },
                { label: 'LED NEXT', control: 'cycleLedPattern', action: 'cycle' },
                { label: 'LED MONO', control: 'ledMonochrome' },
                { label: 'MIRROR BEAMS', control: 'mirrorBallRaysActive' },
                { label: 'MULTI-BEAM FILTER', control: 'spotPrismActive' },
                { label: 'SMOKE SETTINGS', action: 'page', target: 'smokeSettings' },
                common.back,
                common.close
            ],
            smokeSettings: [
                { label: 'SMOKE', control: 'smokeActive' },
                { label: 'SMOKE AMOUNT', control: 'cycleFogAmount', action: 'cycle' },
                { label: 'SMOKE OUTPUT', control: 'cycleFogMode', action: 'cycle' },
                { label: 'DENSE SHOW SMOKE FOR ME', control: 'toggleReducedShowSmoke', action: 'cycle' },
                common.back, common.close
            ],
            sheetSettings: [
                { label: 'SPOT BRIGHTNESS', control: 'cycleSpotBrightness', action: 'cycle' },
                { label: 'LASER BRIGHTNESS', control: 'cycleLaserBrightness', action: 'cycle' },
                { label: 'WALL BRIGHTNESS', control: 'cycleLedBrightness', action: 'cycle' },
                { label: 'SHEET SPEED', control: 'cycleSheetSpeed', action: 'cycle' },
                { label: 'SHEET BRIGHTNESS', control: 'cycleSheetBrightness', action: 'cycle' },
                common.back, common.close
            ],
            comfort: [
                { label: 'LOCOMOTION', control: 'vrComfortMode' },
                { label: 'SAFE MODE', control: 'photosensitiveSafeMode' },
                { label: 'SEATED MODE', control: 'vrSeatedMode' },
                { label: 'MEASURE EYE HEIGHT', action: 'measureHeight' },
                { label: 'QUALITY', action: 'quality' },
                { label: 'AUTO QUALITY', control: 'autoQuality' },
                { label: 'CONVERSATION AUDIO', action: 'voiceClarity' },
                { label: 'ADVANCED GRAPHICS', action: 'page', target: 'graphics' },
                { label: 'CREDITS / LICENCES', action: 'page', target: 'credits' },
                { label: 'CAMERA', action: 'page', target: 'camera' },
                common.back,
                common.close
            ],
            graphics: [
                { label: '4X EDGE SMOOTHING', action: 'vrMsaa4x' },
                { label: 'HIGH PRECISION SHADERS', action: 'renderExperiment', experiment: 'precision' },
                { label: 'SMOOTH SHINY SURFACES', action: 'renderExperiment', experiment: 'specular' },
                { label: 'MAX TEXTURE FILTERING', action: 'renderExperiment', experiment: 'anisotropy' },
                common.back,
                common.close
            ],
            me: [
                { label: 'CHOOSE BODY', action: 'page', target: 'body' },
                { label: 'EDIT OUTFIT', action: 'page', target: 'appearanceEditor' },
                common.back,
                common.close
            ],
            body: [
                { label: 'CLUB CHARACTERS', action: 'page', target: 'character' },
                ...(this.hasCustomAvatarGlb?.() ? [{ label: 'UPLOADED AVATAR', action: 'customAvatar' }] : []),
                ...(this.hasCustomAvatarGlb?.() ? [{ label: 'SHARE UPLOADED MODEL', action: 'page', target: 'uploadedSharing' }] : []),
                common.back,
                common.close
            ],
            character: this._vrCharacterPageDefinitions(common),
            uploadedSharing: [
                { label: 'SHARE MODEL WITH ROOM', action: 'customSharing', enabled: true },
                { label: 'STOP SHARING MODEL', action: 'customSharing', enabled: false },
                common.back, common.close
            ],
            // Who is in the club: a personal choice, like Safe Mode, so it is never the host's.
            crowd: [
                { label: 'DANCERS', action: 'people', people: 'dancers' },
                { label: 'BYSTANDERS', action: 'people', people: 'bystanders' },
                { label: 'DJ', action: 'people', people: 'dj' },
                { label: 'CHOOSE DJ', action: 'page', target: 'dj' },
                { label: 'EVERYONE', action: 'people', people: 'all' },
                { label: 'CROWD DETAIL', action: 'characterStyle' },
                { label: 'STANDARD FOR ME', action: 'lightweightCharacters' },
                ...(this.characterStyleStatus && this.characterStyleStatus().error
                    ? [{ label: 'RETRY CHARACTERS', action: 'retryCharacters' }] : []),
                common.back,
                common.close
            ],
            travel: [
                { label: 'ENTRANCE', control: 'arrival', action: 'travel' },
                { label: 'DANCE FLOOR', control: 'danceFloor', action: 'travel' },
                { label: 'DJ BOOTH', control: 'djBooth', action: 'travel' },
                { label: this.venueId === 'gashouder' ? 'HALL PERIMETER' : 'BALCONY', control: 'balcony', action: 'travel' },
                { label: this.venueId === 'gashouder' ? 'LOADING ENTRANCE' : 'STREET', control: 'street', action: 'travel' },
                common.back,
                common.close
            ],
            show: [
                { label: 'AUTO NOCTURNE', action: 'showMood', value: 'nocturne' },
                { label: 'AUTO AESTHETIC', action: 'showMood', value: 'aesthetic' },
                ...(this.venueId === 'gashouder'
                    ? [{ label: 'GASHOUDER NIGHT', action: 'showMood', value: 'gashouder' }]
                    : []),
                { label: 'DROP NOW', action: 'showPeak' },
                { label: 'BLACKOUT', action: 'showBlackout' },
                { label: 'GO TO VJ BOOTH', control: 'djBooth', action: 'travel' },
                common.back,
                common.close
            ],
            showSections: [
                { label: 'ARRIVAL', action: 'showSection', section: 'arrival' },
                { label: 'PULSE', action: 'showSection', section: 'pulse' },
                { label: 'ASCENT', action: 'showSection', section: 'ascent' },
                { label: 'IGNITION', action: 'showSection', section: 'ignition' },
                { label: 'AFTERGLOW', action: 'showSection', section: 'afterglow' },
                common.back,
                common.close
            ],
            // The first row is the seek bar (its own mesh), so its three button slots stay empty.
            music: [
                null, null, null,
                { label: '\u2212 1 MIN', action: 'seek', delta: -60 },
                { label: 'PLAY / PAUSE', action: 'playPause' },
                { label: '+ 1 MIN', action: 'seek', delta: 60 },
                { label: 'PREVIOUS SOURCE', action: 'sourceStep', delta: -1 },
                { label: 'STOP', action: 'stop' },
                { label: 'NEXT SOURCE', action: 'sourceStep', delta: 1 },
                { label: 'SOURCES', action: 'page', target: 'musicSources' },
                common.back,
                common.close
            ],
            musicSources: [
                { label: 'PREVIOUS SOURCE', action: 'sourceStep', delta: -1 },
                { label: 'PLAY SOURCE', action: 'savedSet' },
                { label: 'NEXT SOURCE', action: 'sourceStep', delta: 1 },
                { label: 'FOLDER PLAY MODE', action: 'folderMode' },
                { label: 'ADD FROM PHONE', action: 'phoneOpen', kind: 'music' },
                ...(!this._immersive || this._immersive.mode === 'manual'
                    ? [{ label: 'LOCAL FILE / FOLDER', action: 'musicSetup' }] : []),
                ...(this.musicLibrary?.readError ? [{ label: 'RETRY SAVED SETS', action: 'retrySavedSets' }] : []),
                ...(this.musicLibrary?.readError === 'unreadable' ? [{ label: 'RESET SAVED SETS', action: 'resetSavedSets' }] : []),
                common.back,
                common.close
            ],
            musicPhone: [
                { label: 'OPEN PHONE COMPANION', action: 'phoneOpen', kind: 'music' },
                common.back,
                common.close
            ],
            phoneCompanion: [
                { label: 'LINK THIS DEVICE', action: 'phonePair' },
                { label: 'SYNC SAVED MUSIC', action: 'phoneTransfer', operation: 'music' },
                { label: 'DOWNLOAD PRESETS', action: 'phoneTransfer', operation: 'import' },
                { label: 'UPLOAD PRESETS', action: 'phoneTransfer', operation: 'export' },
                window.VRPayment?.phoneCompanionAvailable === false
                    ? { label: 'QUESTDEV IS ISOLATED', detail: 'NO PRODUCTION ACCOUNT ACCESS', action: 'creditText' }
                    : { label: 'ON YOUR PHONE', detail: 'OPEN THIS SITE /link/?music=1', action: 'creditText' },
                common.back, common.close
            ],
            dj: [
                { label: 'MALE DJ', action: 'dj', dj: 'male' },
                { label: 'FEMALE DJ', action: 'dj', dj: 'female' },
                ...(this.hasCustomAvatarGlb?.() ? [{ label: 'MY UPLOADED AVATAR', action: 'dj', dj: 'personal' }] : []),
                common.back,
                common.close
            ]
        };
        if (page.startsWith('appearance')) {
            return this.avatarEditor?.getVRDefinitions(page) || [
                { label: 'BACK', action: 'back', target: 'me' },
                { label: 'CANCEL', action: 'appearanceCancel' }
            ];
        }
        // The panel has twelve button slots: in a room the extra ACCESS row would push CLOSE off the end.
        if (pages.home.length > 12) pages.home = [...pages.home.slice(0, 11), common.close];
        return pages[page] || pages.home;
    }

    _showVRQuickMenuPage(page) {
        const multiplayer = this._multiplayer();
        if (page === 'online' && multiplayer && !multiplayer.connected && !multiplayer.hasAcceptedOnlineSafety()) {
            page = 'onlineSafety';
        }
        this._vrQuickMenuPage = page;
        if (page === 'chat' && this.multiplayer) this.multiplayer.markChatRead();
        const definitions = this._vrQuickMenuPageDefinitions(page);
        this._syncVRWardrobe(page);
        this._vrQuickMenuButtons.forEach((button, index) => {
            const definition = definitions[index];
            button.mesh.setEnabled(!!definition);
            if (!definition) return;
            button.label = '';
            button.control = null;
            button.action = null;
            button.target = null;
            button.dj = null;
            button.delta = 0;
            button.op = null;
            button.peer = null;
            button.gesture = null;
            button.emoji = null;
            button.digit = null;
            button.pool = null;
            button.phrase = null;
            button.people = null;
            button.section = null;
            button.room = null;
            button.capacity = null;
            button.locked = false;
            button.full = false;
            button.inactive = false;
            button.scope = null;
            button.reason = null;
            button.info = null;
            button.danger = false;
            button.character = undefined;
            button.detail = '';
            button.experiment = null;
            button.field = null;
            button.value = null;
            button.swatch = null;
            Object.assign(button, definition);
            this._drawVRQuickMenuButton(button);
        });
        // The seek bar lives on the Music page only, and only that page keeps its clock ticking.
        if (this._vrSeek) {
            this._vrSeek.mesh.setEnabled(page === 'music');
            if (page === 'music') this._startVRMusicTicker();
            else this._stopVRMusicTicker();
            this._drawVRSeekBar();
        }
        this._drawVRQuickMenuBack(definitions);
        if (this._vrQuickMenuHeaderTexture) {
            const context = this._vrQuickMenuHeaderTexture.getContext();
            context.clearRect(0, 0, 1024, 192);
            context.fillStyle = '#8fffee';
            context.font = 'bold 66px sans-serif';
            context.textAlign = 'left';
            context.textBaseline = 'middle';
            const titles = { home: 'VR CLUB', onlineSafety: 'BEFORE YOU GO ONLINE', room: 'JOIN ROOM', look: 'RANDOM LOOK', gestures: 'REACT', chat: 'CHAT', crowd: 'WHO IS HERE',
                sheetSettings: 'FIXTURE BRIGHTNESS / SHEET',
                me: 'WARDROBE', body: 'CHOOSE YOUR BODY', credits: 'CREDITS AND LICENCES', graphics: 'ADVANCED GRAPHICS',
                camera: 'LOCAL POSTCARD', character: 'YOUR CHARACTER', uploadedSharing: 'SHARE YOUR UPLOADED MODEL',
                appearanceEditor: 'PERSONAL WARDROBE', appearanceBase: 'BASE CHARACTER', appearanceHair: 'HAIR STYLE',
                appearanceOutfit: 'OUTFIT STYLE', appearanceSkin: 'SKIN COLOR', appearanceHairColor: 'HAIR COLOR',
                appearanceTop: 'TOP COLOR', appearanceBottom: 'BOTTOM COLOR',
                appearanceAccessories: 'ACCESSORIES', appearanceGlasses: 'GLASSES',
                appearanceFacialHair: 'FACIAL HAIR', appearanceHat: 'HEADWEAR',
                appearanceFootwear: 'SHOES AND TIGHTS', appearanceShoes: 'SHOES', appearanceLegwear: 'LEGWEAR',
                voiceAudience: 'MICROPHONE AUDIENCE', chatAudience: 'CHAT RECIPIENTS', welcome: 'WELCOME', access: 'LINK YOUR ACCOUNT', musicPhone: 'MUSIC FROM YOUR PHONE' };
            // Immersive launch pages draw their own words: the pairing code is the title, so it is read at arm's length.
            const immersiveText = page === 'phoneCompanion'
                ? window.VRPayment?.phoneCompanionAvailable === false
                    ? { title: 'PHONE SYNC UNAVAILABLE', subtitle: 'QUESTDEV HAS NO VERIFIED ACCOUNT SERVICE' }
                    : { title: this._phonePairCode || 'PHONE COMPANION', subtitle: 'OPEN THIS SITE /link/?music=1 ON YOUR PHONE' }
                : (page === 'welcome' || page === 'access' || page === 'musicPhone') && this._immersive ? this._immersive.pageText(page) : null;
            context.fillText(immersiveText ? immersiveText.title : (titles[page] || page.toUpperCase()), 54, 72);
            context.fillStyle = '#b4bccb';
            // In someone else's room the music and lighting pages say whose they are, not only "HOST ONLY" per button.
            const hostOwned = ['home', 'lights', 'effects', 'show', 'showSections', 'music'].includes(page) && this.isFollowingHost();
            const host = hostOwned ? (this.multiplayer.hostName() || 'THE HOST').toUpperCase().slice(0, 18) : '';
            // What each page is for, in plain words: the first thing a new visitor reads.
            const about = {
                lights: 'FIXTURES, COLOURS AND SPOT MOVEMENT',
                spotRig: 'SELECTED SPOTS ABOVE; ORDER AFFECTS ALL SIX',
                spotGroups: 'ENTRANCE TO DJ; LEFT AND RIGHT FACE THE DJ',
                spotHeads: 'ENTRANCE TO DJ; LEFT AND RIGHT FACE THE DJ',
                effects: 'LED WALL, STROBES, SMOKE AND BEAMS',
                smokeSettings: 'CHOOSE THE AMOUNT AND HOW SMOKE IS RELEASED',
                sheetSettings: 'EACH BRIGHTNESS CHANGES ONLY THAT FIXTURE',
                show: 'QUICK MOODS; DETAILED CONTROLS AT THE VJ BOOTH',
                showSections: 'JUMP TO A MOVEMENT AND KEEP IT BY YOUR HOLD RULE',
                comfort: 'HOW YOU MOVE, WHAT YOU SEE AND FEEL',
                me: 'ONE WARDROBE FOR CLUB AND UPLOADED BODIES',
                body: 'CHOOSE A CLUB CHARACTER OR YOUR OWN MODEL',
                graphics: 'EXPERIMENTS MAY COST FRAME RATE OR REQUIRE RELOAD',
                credits: 'PAGED ATTRIBUTION AND SOURCE LINKS; STAY IN VR',
                camera: 'SAVED LOCALLY; NOTHING IS AUTOMATICALLY SHARED',
                character: 'YOUR BODY, MIRROR AND ONLINE APPEARANCE',
                appearanceEditor: this.isCustomAvatarSelected?.() ? 'FIT CLOTHING TO YOUR UPLOADED BODY; APPLY TO SAVE' : 'CUSTOMIZE YOUR CLUB CHARACTER',
                uploadedSharing: 'ROOM GUESTS RECEIVE YOUR MODEL AND MAY KEEP A COPY',
                appearanceBase: 'CHOOSE YOUR PERSONAL AVATAR BASE',
                appearanceHair: 'CHOOSE YOUR PERSONAL HAIR STYLE',
                appearanceOutfit: 'CHOOSE YOUR PERSONAL OUTFIT',
                appearanceSkin: 'CHOOSE A SKIN COLOR',
                appearanceHairColor: 'CHOOSE A HAIR COLOR',
                appearanceTop: 'CHOOSE A TOP COLOR',
                appearanceBottom: 'CHOOSE A BOTTOM COLOR',
                appearanceAccessories: 'GLASSES, FACIAL HAIR, HEADWEAR, SHOES AND TIGHTS',
                appearanceFootwear: 'CHOOSE SHOES AND LEGWEAR FOR YOUR PERSONAL AVATAR',
                appearanceShoes: 'CHOOSE ORIGINAL SHOES, LOAFERS, PUMPS OR HEELED ANKLE BOOTS',
                appearanceLegwear: 'CHOOSE BARE LEGS OR SHEER TIGHTS',
                appearanceGlasses: 'CHOOSE YOUR FRAMES OR SUNGLASSES',
                appearanceFacialHair: 'COLOUR FOLLOWS YOUR HAIR COLOUR',
                appearanceHat: 'HEADWEAR COVERS YOUR HAIR TO AVOID CLIPPING',
                crowd: 'HOST CHOOSES STYLE; LIGHTWEIGHT FOR ME IS PERSONAL',
                travel: 'POINT AT A PLACE TO JUMP THERE',
                music: 'CONTROL THE CURRENT TRACK OR CHANGE SOURCE',
                musicSources: 'SAVED LINKS AND THIS SESSION\u2019S LOCAL FOLDER',
                onlineSafety: 'KEEP DETAILS PRIVATE \u2022 LEAVE \u2022 REPORT + BLOCK'
            };
            const subtitle = immersiveText ? immersiveText.subtitle
                : page === 'music' && this.multiplayer?.hasLiveEvent ? 'THE LIVE EVENT DJ SUPPLIES THE MUSIC'
                : hostOwned
                ? `${host} IS THE HOST: THEIR MUSIC AND LIGHTS`
                : about[page] || this._vrNetSubtitle(page) || `${this.graphicsTier.toUpperCase()} QUALITY  \u2022  POINT + TRIGGER`;
            // Large enough to read in a headset (it was 30 px, about 1 degree); long lines shrink to fit instead of overflowing.
            let size = 36;
            context.font = `${size}px sans-serif`;
            while (size > 26 && context.measureText(subtitle).width > 920) context.font = `${--size}px sans-serif`;
            context.fillText(subtitle, 56, 142);
            this._vrQuickMenuHeaderTexture.update();
        }
    }

    /**
     * The glass behind the controls: a rounded, slightly translucent sheet as tall as this page's last button row.
     * Row r's buttons are centred at y = 0.36 - r * 0.36 and are 0.27 m tall; the sheet's top edge is y = 0.86 (the
     * panel mesh is 1.80 m tall and offset so its top stays there) and the texture is 632 px per metre.
     */
    _drawVRQuickMenuBack(definitions) {
        const texture = this._vrQuickMenuBackTexture;
        if (!texture) return;
        let last = 0;
        definitions.forEach((definition, index) => { if (definition) last = index; });
        const rows = Math.floor(last / 3) + 1;
        const PX = 632;
        const bottom = Math.min(1.78, 0.86 - (0.36 - (rows - 1) * 0.36 - 0.135 - 0.07));
        const w = 1024, top = 6, height = Math.round(bottom * PX) - top - 6, radius = 64;
        const context = texture.getContext();
        context.clearRect(0, 0, 1024, 1138);
        const x = 6, width = w - 12;
        context.beginPath();
        context.moveTo(x + radius, top);
        context.arcTo(x + width, top, x + width, top + height, radius);
        context.arcTo(x + width, top + height, x, top + height, radius);
        context.arcTo(x, top + height, x, top, radius);
        context.arcTo(x, top, x + width, top, radius);
        context.closePath();
        const fill = context.createLinearGradient(0, top, 0, top + height);
        fill.addColorStop(0, 'rgba(10, 20, 30, 0.90)');
        fill.addColorStop(1, 'rgba(5, 9, 16, 0.84)');
        context.fillStyle = fill;
        context.fill();
        context.lineWidth = 6;
        context.strokeStyle = 'rgba(143, 255, 238, 0.45)';
        context.stroke();
        texture.update();
    }

    // ---- The seek bar -------------------------------------------------------------------------------------
    // One plane with a canvas texture. A pick on it maps to a fraction of the set through the plane's local x
    // (the bar spans SEEK_BAR_PX of the texture), so it works with any controller ray and needs no slider mesh.

    static get VR_SEEK_BAR_PX() { return { left: 70, right: 954, width: 1024, height: 192 }; }

    /** Fraction (0..1) of the bar at a world-space pick point on the seek plane. */
    _vrSeekFractionAt(point) {
        const mesh = this._vrSeek && this._vrSeek.mesh;
        if (!mesh || !point) return null;
        const inverse = mesh.getWorldMatrix().clone().invert();
        const local = BABYLON.Vector3.TransformCoordinates(point, inverse);
        const { left, right, width } = VRClubUI.VR_SEEK_BAR_PX;
        const px = (local.x / this._vrSeek.width + 0.5) * width;
        return Math.min(1, Math.max(0, (px - left) / (right - left)));
    }

    _drawVRSeekBar() {
        if (!this._vrSeek) return;
        const { left, right, width, height } = VRClubUI.VR_SEEK_BAR_PX;
        const ctx = this._vrSeek.texture.getContext();
        const info = this.getPlaybackInfo();
        const drag = this._vrSeek.drag;
        const fraction = drag ? drag.fraction : (info.seekable ? info.position / info.duration : 0);
        const shownSeconds = drag ? drag.fraction * info.duration : info.position;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#10161f';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = info.seekable ? '#8fffee' : '#4a5363';
        ctx.lineWidth = 6;
        ctx.strokeRect(3, 3, width - 6, height - 6);

        // What is playing, and whose.
        const title = this.nowPlayingLabel || 'Nothing playing';
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 40px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        let shown = title;
        while (shown.length > 4 && ctx.measureText(shown).width > right - left) shown = `${shown.slice(0, -2)}\u2026`;
        ctx.fillText(shown, left, 42);

        // The bar.
        const y = 112, h = 24;
        ctx.fillStyle = '#2a3342';
        ctx.fillRect(left, y - h / 2, right - left, h);
        if (info.seekable) {
            const x = left + fraction * (right - left);
            ctx.fillStyle = drag ? '#ffd166' : '#16c7b4';
            ctx.fillRect(left, y - h / 2, x - left, h);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(x, y, 22, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = '#c5cad4';
        ctx.font = '34px sans-serif';
        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';
        const clock = window.AudioUtils ? window.AudioUtils.formatClock : (s => String(Math.floor(s)));
        if (info.seekable) {
            ctx.fillText(clock(shownSeconds), left, 178);
            ctx.textAlign = 'right';
            ctx.fillText(clock(info.duration), right, 178);
        } else {
            ctx.fillText(this._audioKind ? 'Live stream: no position to seek'
                : (this._immersive && this._immersive.mode !== 'manual' ? 'ADD MUSIC FROM YOUR PHONE' : 'ADD MUSIC: FILE OR URL'), left, 178);
        }
        this._vrSeek.texture.update();
    }

    _startVRMusicTicker() {
        if (this._vrMusicTicker || this._disposed) return;
        // Twice a second is plenty for a clock; it runs only while the menu is open on the Music page.
        this._vrMusicTicker = setInterval(() => {
            const open = this._vrQuickMenuRoot && this._vrQuickMenuRoot.isEnabled() && this._vrQuickMenuPage === 'music';
            if (!open) { this._stopVRMusicTicker(); return; }
            this._drawVRSeekBar();
            this._vrQuickMenuButtons.forEach(button => {
                if (button.action === 'playPause') this._drawVRQuickMenuButton(button);
            });
        }, 500);
    }

    _stopVRMusicTicker() {
        if (this._vrMusicTicker) clearInterval(this._vrMusicTicker);
        this._vrMusicTicker = null;
    }

    _beginVRSeek(pickResult) {
        if (!this.guardHostControl('music')) return;
        const info = this.getPlaybackInfo();
        if (!info.seekable) {
            this.showErrorMessage('Nothing to seek in: a live stream has no position.');
            return;
        }
        const fraction = this._vrSeekFractionAt(pickResult.pickedPoint);
        if (fraction === null) return;
        this._vrSeek.drag = { fraction };
        this._drawVRSeekBar();
    }

    _moveVRSeek(pickResult) {
        const drag = this._vrSeek && this._vrSeek.drag;
        if (!drag || !pickResult || !pickResult.hit || pickResult.pickedMesh !== this._vrSeek.mesh) return;
        const fraction = this._vrSeekFractionAt(pickResult.pickedPoint);
        if (fraction === null || Math.abs(fraction - drag.fraction) < 0.002) return;
        drag.fraction = fraction;
        this._drawVRSeekBar();
    }

    _endVRSeek() {
        const drag = this._vrSeek && this._vrSeek.drag;
        if (!drag) return;
        this._vrSeek.drag = null;
        this.seekAudioFraction(drag.fraction);
        this._drawVRSeekBar();
    }

    async _openQuestPanel(kind) {
        this.toggleVRQuickMenu(false);
        // An immersive-only app has no 2D page to come back to: leaving VR would strand the guest on an empty window.
        if (this._immersive && this._immersive.mode !== 'manual') {
            this.showErrorMessage(kind === 'credits'
                ? 'Credits and licences: open this site on your phone and tap About.'
                : 'Add music from your phone: Music, Sources, ADD FROM PHONE.');
            return;
        }
        try {
            if (this.isInVRMode && this.vrHelper) {
                window.VRPayment?.holdLeaseForSetup?.();
                await this.vrHelper.baseExperience.exitXRAsync();
            }
            const open = kind === 'credits' ? window.openClubCredits : window.openMusicSetup;
            if (!open) throw new Error('The setup panel is not ready.');
            open();
        } catch (error) {
            this.showErrorMessage(`Could not open the panel: ${error.message}`);
        }
    }

    async _runVRMusicAction(button) {
        if (this.liveInput?.active && button.action === 'stop') { this.stopAudioPlayback(); return; }
        if (this.liveInput?.active && button.action === 'musicSetup') { await this._openQuestPanel('music'); return; }
        if (!this.guardHostControl('music')) return;
        const library = this.musicLibrary;
        if (button.action === 'seek') {
            if (!this.seekAudioBy(button.delta)) this.showErrorMessage('Nothing to seek in.');
        } else if (button.action === 'playPause') {
            this.toggleAudioPlayback();
        } else if (button.action === 'play') {
            this.setAudioPlayback(true);
        } else if (button.action === 'pause') {
            this.setAudioPlayback(false);
        } else if (button.action === 'stop') {
            this.stopAudioPlayback();
        } else if (button.action === 'sourceStep') {
            try {
                await this.stepAudioSource(button.delta);
            } catch (err) {
                this.showErrorMessage(`Could not change source: ${err && err.message ? err.message : 'unknown error'}`);
            }
        } else if (button.action === 'folderMode') {
            const shuffle = this._localPlaylist ? this._localPlaylist.shuffle : !!this._localPlaylistShuffle;
            this.setLocalPlaylistShuffle(!shuffle);
        } else if (button.action === 'musicSetup') {
            await this._openQuestPanel('music');
            return;
        } else if (!library) {
            this.showErrorMessage('The music player is not ready yet.');
        } else {
            try {
                if (button.action === 'setStep') library.step(button.delta);
                else await library.play();
            } catch (err) {
                this.showErrorMessage(`Could not start the music: ${err && err.message ? err.message : 'unknown error'}`);
            }
        }
        this._refreshVRQuickMenu();
    }

    _refreshVRQuickMenu() {
        if (!this._vrQuickMenuButtons) return;
        this._showVRQuickMenuPage(this._vrQuickMenuPage || 'home');
    }

    _getAvatarEditor() {
        if (this.avatarEditor) return this.avatarEditor;
        if (typeof window.AvatarEditor !== 'function') return null;
        this.avatarEditor = new window.AvatarEditor(this);
        return this.avatarEditor;
    }

    _syncVRWardrobe(page) {
        this.syncPhoneCompanion?.(page, !!this._vrQuickMenuRoot?.isEnabled());
        if (!this.avatarEditor) return;
        this.avatarEditor.syncVR(page, this._vrQuickMenuRoot, !!this._vrQuickMenuRoot?.isEnabled());
    }

    _activateVRQuickMenuButton(button) {
        if (!button) return;
        if (button.action === 'phoneOpen') { this.openPhoneCompanion(button.kind); return; }
        if (button.action === 'phonePair') { this.startPhoneCompanionPairing(); return; }
        if (button.action === 'phoneTransfer') { void this.transferPhoneCompanion(button.operation); return; }
        if (button.action === 'creditText') return;
        if (button.action === 'creditPage') {
            this._vrCreditsPage = Math.max(0, (this._vrCreditsPage || 0) + button.delta);
            this._showVRQuickMenuPage('credits');
            return;
        }
        if (button.action === 'voiceClarity') {
            this.toggleVoiceClarity();
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'postcardCapture') { void this.capturePostcard(); return; }
        if (button.action === 'postcardSave') { this.savePostcard(); return; }
        if (button.action === 'postcardInvite') { this.copyPostcardInvite(); return; }
        if (button.action === 'showMood' || button.action === 'showBlackout') {
            if (button.action === 'showMood') this.setShowMood(button.value);
            else this.blackOutShow();
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'spotGroup') {
            if (this.selectSpotRigGroup(button.group)) this._showVRQuickMenuPage('spotRig');
            return;
        }
        if (button.action === 'close') {
            this.toggleVRQuickMenu(false);
            return;
        }
        if (['welcomeSafe', 'welcomeFull', 'accessNewCode', 'accessExit', 'musicSync'].includes(button.action)) {
            if (this._immersive) this._immersive.handleMenuAction(button.action);
            return;
        }
        if (button.action === 'retrySavedSets') {
            this._vrArmed = null;
            if (this.musicLibrary?.retrySavedSets()) this.showErrorMessage('Saved sets loaded.');
            else this.showErrorMessage('Saved sets still cannot be read. The stored list was not changed.');
            this._showVRQuickMenuPage(this._vrQuickMenuPage);
            return;
        }
        if (button.action === 'resetSavedSets') {
            if (!this._vrArmed || this._vrArmed.key !== 'resetSavedSets' || this._vrArmed.until < Date.now()) {
                this._vrArmed = { key: 'resetSavedSets', until: Date.now() + 4000 };
                this.showErrorMessage('Press RESET SAVED SETS again within four seconds to permanently erase the unreadable list.');
                return;
            }
            this._vrArmed = null;
            try {
                this.musicLibrary.resetUnreadableSets();
                this.showErrorMessage('Unreadable saved list reset on this device.');
            } catch (error) { this.showErrorMessage(error.message); }
            this._showVRQuickMenuPage(this._vrQuickMenuPage);
            return;
        }
        if (button.action === 'page') {
            if (button.target === 'appearanceEditor') {
                const editor = this._getAvatarEditor();
                if (!editor) {
                    this.showErrorMessage('Personal wardrobe is unavailable in this build.');
                    return;
                }
                if (!editor.openVR()) return;
            }
            // Remember where this page was opened from, so its BACK returns there (REACT is reached from HOME and ONLINE).
            this._vrPageParent = { ...(this._vrPageParent || {}), [button.target]: this._vrQuickMenuPage || 'home' };
            // The picker opens on the page that holds the current character: women and the default, or men.
            if (button.target === 'character') this._vrCharacterPage = (this.getLocalCharacter() || '')[0] === 'm' ? 1 : 0;
            this._showVRQuickMenuPage(button.target);
            return;
        }
        if (button.action === 'back') {
            const parent = this._vrPageParent && this._vrPageParent[this._vrQuickMenuPage];
            this._showVRQuickMenuPage(parent || button.target || 'home');
            return;
        }
        if (button.action === 'appearanceSet') {
            this.avatarEditor?.setDraftValue(button.field, button.value);
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'appearanceBasePage') {
            const editor = this.avatarEditor;
            if (!editor) return;
            editor.vrBasePage = Math.max(0, Math.min(2, editor.vrBasePage + button.delta));
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'appearanceColorPage') {
            const editor = this.avatarEditor;
            if (!editor) return;
            const maxPage = Math.ceil(window.AvatarEditor.COLORS.length / 8) - 1;
            editor.vrColorPage[button.field] = Math.max(0, Math.min(maxPage,
                (editor.vrColorPage[button.field] || 0) + button.delta));
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'appearanceRotate') {
            this.avatarEditor?.rotateVR(button.delta);
            return;
        }
        if (button.action === 'appearanceSave') {
            void (async () => {
                if (!await this.avatarEditor?.saveVR()) return;
                this._showVRQuickMenuPage('me');
                this.showErrorMessage('Personal appearance saved.');
            })();
            return;
        }
        if (button.action === 'appearanceReset') {
            void (async () => {
                if (!await this.avatarEditor?.resetVR()) return;
                this._showVRQuickMenuPage('me');
                this.showErrorMessage('Personal appearance reset.');
            })();
            return;
        }
        if (button.action === 'appearanceCancel') {
            this.avatarEditor?.cancelVR();
            this._showVRQuickMenuPage('me');
            return;
        }
        if (button.action === 'net' || button.action === 'person') {
            this._runVRNetworkAction(button);
            return;
        }
        if (button.action === 'credits') {
            this._showVRQuickMenuPage('credits');
            return;
        }
        if (button.action === 'dj') {
            this.chooseDJ(button.dj).then(() => this._refreshVRQuickMenu())
                .catch(error => this.showErrorMessage(error.message));
            return;
        }
        if (VR_MUSIC_ACTIONS.has(button.action)) {
            this._runVRMusicAction(button);
            return;
        }
        if (button.action === 'travel') {
            this.moveCameraToPreset(button.control);
            this.toggleVRQuickMenu(false);
            return;
        }
        if (button.action === 'quality') {
            const tiers = ['balanced', 'high', 'ultra'];
            this.setGraphicsTier(tiers[(tiers.indexOf(this.graphicsTier) + 1) % tiers.length]);
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'vrMsaa4x') {
            this.toggleVRMsaa4x();
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'renderExperiment') {
            this.toggleRenderExperiment(button.experiment);
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'reset') {
            if (!this.guardHostControl('lights')) return;
            this.resetVJControls();
            this.showErrorMessage('Light show reset to defaults');
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'autoShow') {
            if (!this.guardHostControl('lights')) return;
            this.resumeAutoShow();
            this.showErrorMessage('NOCTURNE auto show resumed');
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'nextSection') {
            const title = this.nextShowSection();
            if (title) this.showErrorMessage(`Section: ${title}. ${this.lightHoldSummary().toLowerCase()}`);
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'holdLook') {
            this.toggleShowLookHold();
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'showDrop') {
            if (!this.guardHostControl('lights')) return;
            if (this.showDirector && this.showDirector.isDriving()) this.showDirector.triggerShowDrop();
            else this.triggerShowPeak();
            this.showErrorMessage(this.showDirector && this.showDirector.isDriving() ? 'Countdown started' : 'Peak look triggered');
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'showPeak') {
            if (this.triggerShowPeak()) this.showErrorMessage('Peak look triggered');
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'showSection') {
            const title = this.pickShowSection(button.section);
            if (title) this.showErrorMessage(`Section: ${title}. ${this.lightHoldSummary().toLowerCase()}`);
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'holdMode') {
            this.cycleLightHoldMode();
            this.showErrorMessage(`After you change a light: ${VRClubUI.LIGHT_HOLD_NAMES[this.lightHold.mode].toLowerCase()}`);
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'holdTiming') {
            this.cycleLightHoldTiming();
            this.showErrorMessage(this.lightHoldSummary().toLowerCase());
            this._refreshVRQuickMenu();
            return;
        }
        if (button.control === 'vrComfortMode') {
            this.setVRComfortMode(!this.vrComfortMode);
            return;
        }
        if (button.control === 'autoQuality') {
            this.setAutoQuality(!this.autoQuality);
            return;
        }
        if (button.control === 'vrSeatedMode') {
            this.setSeatedMode(!this.vrSeatedMode);
            return;
        }
        if (button.action === 'pickCharacter') {
            const id = this.setLocalCharacter(button.character);
            if (id === false) return;
            this.showErrorMessage(id ? `Your character: ${button.label.toLowerCase()}, ${button.detail.toLowerCase()}`
                : this.multiplayer?.connected ? 'Choosing a random room character\u2026' : 'Your character: your own body');
            return;
        }
        if (button.action === 'customAvatar') {
            if (this.setCustomAvatarSelected(!this.isCustomAvatarSelected())) this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'customSharing') {
            try {
                this.setCustomAvatarSharing(button.enabled);
                this.showErrorMessage(this.customAvatarSharingStatus().message);
            } catch (error) { this.showErrorMessage(error.message); }
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'characterPage') {
            this._vrCharacterPage = this._vrCharacterPage === 1 ? 0 : 1;
            this._showVRQuickMenuPage('character');
            return;
        }
        if (button.action === 'measureHeight') {
            this.startHeightMeasure();
            this._refreshVRQuickMenu();
            return;
        }
        if (button.control === 'photosensitiveSafeMode') {
            this.setPhotosensitiveSafeMode(!this.photosensitiveSafeMode);
            this._refreshVRQuickMenu();
            return;
        }
        if (button.action === 'characterStyle') {
            this.setCharacterStyle(this.getRoomCharacterStyle() === 'diverse' ? 'quaternius' : 'diverse');
            return;
        }
        if (button.action === 'lightweightCharacters') {
            this.setLightweightCharacters(!this.characterStyleStatus().lightweight);
            return;
        }
        if (button.action === 'retryCharacters') {
            this.retryCharacterStyle();
            return;
        }
        if (button.action === 'people') {
            // Who is in the club: personal and local, so it is never gated on the host.
            const here = this.togglePeopleVisible(button.people);
            const who = button.people === 'all' ? 'Everyone'
                : button.people === 'dj' ? 'The DJ'
                : button.people === 'dancers' ? 'The dancers' : 'The bystanders';
            this.showErrorMessage(button.people === 'dj' && this._roomDJVisible === false
                ? 'The host has sent the room DJ home. Your own DJ preference is saved.'
                : here ? `${who}: back in the club` : `${who}: sent home`);
            this._refreshVRQuickMenu();
            return;
        }

        // The remaining show controls are host-owned in someone else's room (the legacy "lights" guard name is
        // retained for multiplayer protocol compatibility).
        if (button.control !== 'cycleSpotTarget' && !this.guardHostControl('lights')) return;
        this.toggleLightControl(button.control);
        this._refreshVRQuickMenu();
    }

    _createVRQuickMenu() {
        if (this._vrQuickMenuRoot) return;
        const root = new BABYLON.TransformNode('vrQuickMenuRoot', this.scene);
        const panel = BABYLON.MeshBuilder.CreatePlane('vrQuickMenuPanel', {
            width: 1.62,
            height: 1.80,
            sideOrientation: BABYLON.Mesh.DOUBLESIDE
        }, this.scene);
        panel.parent = root;
        panel.position.y = -0.04; // the plane's top edge stays at the header; the glass is drawn only as tall as the page needs
        panel.isPickable = false;
        // A rounded, slightly translucent glass sheet drawn into this texture (see _drawVRQuickMenuBack) instead of a hard
        // opaque slab: it keeps the room visible around the controls and has no dead space below short pages.
        const backTexture = new BABYLON.DynamicTexture('vrQuickMenuBackTexture', { width: 1024, height: 1138 }, this.scene, true);
        backTexture.hasAlpha = true;
        const panelMaterial = this.materialFactory.createStandardMaterial('vrQuickMenuPanelMat', {
            emissiveColor: [0, 0, 0],
            emissiveTexture: backTexture,
            opacityTexture: backTexture,
            disableLighting: true
        });
        panelMaterial.backFaceCulling = false;
        panel.material = panelMaterial;
        this._vrQuickMenuBackTexture = backTexture;

        const header = BABYLON.MeshBuilder.CreatePlane('vrQuickMenuHeader', {
            width: 1.48,
            height: 0.28,
            sideOrientation: BABYLON.Mesh.DOUBLESIDE
        }, this.scene);
        header.parent = root;
        header.position.set(0, 0.65, -0.012);
        header.isPickable = false;
        const headerTexture = new BABYLON.DynamicTexture(
            'vrQuickMenuHeaderTexture',
            { width: 1024, height: 192 },
            this.scene,
            false
        );
        const headerMaterial = this.materialFactory.createStandardMaterial('vrQuickMenuHeaderMat', {
            emissiveColor: [0, 0, 0],
            emissiveTexture: headerTexture,
            disableLighting: true
        });
        headerMaterial.backFaceCulling = false;
        header.material = headerMaterial;
        this._vrQuickMenuHeaderTexture = headerTexture;

        // The seek bar: a wide strip where the Music page's first button row would be.
        const seekWidth = 1.48;
        const seekMesh = BABYLON.MeshBuilder.CreatePlane('vrQuickMenuSeek', {
            width: seekWidth,
            height: 0.28,
            sideOrientation: BABYLON.Mesh.DOUBLESIDE
        }, this.scene);
        seekMesh.parent = root;
        seekMesh.position.set(0, 0.34, -0.012);
        seekMesh.isPickable = true;
        seekMesh.renderingGroupId = 2;
        const seekTexture = new BABYLON.DynamicTexture('vrQuickMenuSeekTexture', { width: 1024, height: 192 }, this.scene, false);
        const seekMaterial = this.materialFactory.createStandardMaterial('vrQuickMenuSeekMat', {
            emissiveColor: [0, 0, 0],
            emissiveTexture: seekTexture,
            disableLighting: true
        });
        seekMaterial.backFaceCulling = false;
        seekMesh.material = seekMaterial;
        seekMesh.setEnabled(false);
        this._vrSeek = { mesh: seekMesh, texture: seekTexture, width: seekWidth, drag: null };

        this._vrQuickMenuButtons = [];
        for (let index = 0; index < 12; index++) {
            const col = index % 3;
            const row = Math.floor(index / 3);
            const mesh = BABYLON.MeshBuilder.CreatePlane(`vrQuickMenuButton${index}`, {
                width: 0.46,
                height: 0.27,
                sideOrientation: BABYLON.Mesh.DOUBLESIDE
            }, this.scene);
            mesh.parent = root;
            mesh.position.set((col - 1) * 0.50, 0.36 - row * 0.36, -0.012);
            mesh.isPickable = true;
            mesh.renderingGroupId = 2;

            const texture = new BABYLON.DynamicTexture(
                `vrQuickMenuTexture${index}`,
                { width: 512, height: 192 },
                this.scene,
                false
            );
            texture.hasAlpha = false;
            const material = this.materialFactory.createStandardMaterial(`vrQuickMenuMat${index}`, {
                emissiveColor: [0, 0, 0],
                emissiveTexture: texture,
                disableLighting: true
            });
            material.backFaceCulling = false;
            mesh.material = material;

            const button = {
                mesh,
                texture,
                material,
                label: '',
                control: null,
                action: null
            };
            this._vrQuickMenuButtons.push(button);
        }
        this._showVRQuickMenuPage('home');
        root.setEnabled(false);
        this._vrQuickMenuRoot = root;
        this.scene.onDisposeObservable.add(() => {
            try { this.avatarEditor?.closeVR(); } catch (_) { /* scene teardown */ }
        });
        // The menu stays visible when immersive launch hides the world (see ImmersiveLaunch.setVeil): it also lives on
        // the extra layer the veil camera looks at.
        for (const mesh of root.getChildMeshes()) mesh.layerMask = VRClubUI.MENU_LAYER_MASK;
        // The ONLINE pages show live state (who joined, who is speaking): redraw them when the session changes.
        const mp = this._multiplayer();
        if (mp) {
            let wasFollowing = mp.following;
            this._vrNetUnsubscribe = mp.onChange(() => {
                const open = this._vrQuickMenuRoot && this._vrQuickMenuRoot.isEnabled();
                const roleChanged = wasFollowing !== mp.following;
                wasFollowing = mp.following;
                // Taking or losing the host's lights and music relabels the lighting and music buttons too, and HOME
                // shows the mic, the unread chat count and (only in a room) the TALK / REACT / CHAT row.
                const page = this._vrQuickMenuPage;
                if (open && (roleChanged || page === 'home' || VRClubUI.VR_NET_PAGES.includes(page))) this._refreshVRQuickMenu();
            });
        }
    }

    toggleVRQuickMenu(force) {
        // The first-run photosensitivity choice and a locked pairing code cannot be waved away.
        if (this._immersive && this._immersive.menuLocked() && (force === false || (force === undefined && this._vrQuickMenuRoot?.isEnabled()))) {
            return true;
        }
        if (force !== false) this._closeVRSocialWheel();
        this._createVRQuickMenu();
        const camera = this.isInVRMode
            ? this.vrHelper?.baseExperience?.camera : this.scene.activeCamera;
        if (!camera) return false;
        const next = force === undefined ? !this._vrQuickMenuRoot.isEnabled() : !!force;
        if (next) this._placeVRQuickMenu(camera);
        if (next) this._refreshVRQuickMenu();
        if (!next) this._stopVRMusicTicker();
        this._vrQuickMenuRoot.setEnabled(next);
        if (!next) this.avatarEditor?.closeVR();
        else this._syncVRWardrobe(this._vrQuickMenuPage);
        return next;
    }

    /**
     * World-lock the menu where the player is looking when it opens: 1.8 m ahead along the horizontal gaze, a
     * little below eye level, upright and turned to face them. Parenting it to the head made it follow every head
     * movement, which is uncomfortable in a headset and makes the buttons hard to aim at.
     */
    _placeVRQuickMenu(camera) {
        const root = this._vrQuickMenuRoot;
        const eye = camera.globalPosition || camera.position;
        const forward = camera.getDirection(BABYLON.Axis.Z);
        let fx = forward.x, fz = forward.z;
        const flat = Math.hypot(fx, fz);
        if (flat < 1e-3) { fx = 0; fz = -1; } else { fx /= flat; fz /= flat; } // looking straight up or down
        root.parent = null;
        root.position.set(eye.x + fx * 1.8, eye.y - 0.1, eye.z + fz * 1.8);
        root.rotationQuaternion = null;
        root.rotation.set(0, Math.atan2(fx, fz), 0);
        root.computeWorldMatrix(true);
    }
}
window.VRClubMenu = VRClubMenu;
