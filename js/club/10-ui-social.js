'use strict';

class VRClubSocialUI extends window.VRClubMenu {

    // ---- ONLINE: the VR face of js/multiplayer.js ----------------------------------------------------------------
    // These pages only read and call the shared ClubMultiplayer (the DOM panel drives the same object), so a person
    // can connect, talk, gesture, block, mute, and (as host) kick, ban or lock without leaving the headset.

    /** The session, created on first use if the DOM script has not (it normally has). */
    _multiplayer() {
        if (this.multiplayer) return this.multiplayer;
        return typeof ClubMultiplayer !== 'undefined' ? new ClubMultiplayer(this) : null;
    }

    static get VR_NET_PAGES() { return ['onlineSafety', 'online', 'liveEvent', 'rooms', 'gestures', 'chat', 'chatHistory', 'reports', 'people', 'person', 'report', 'safety', 'room', 'look', 'voiceAudience', 'chatAudience']; }

    /** Babylon's default layer mask plus one extra bit: the quick menu is on both, the world only on the first. */
    static get MENU_LAYER_MASK() { return 0x1FFFFFFF; }

    /** The five pages' buttons. Names come from other guests, so they are shortened and never interpreted. */
    _vrNetPageDefinitions(page, common) {
        const mp = this._multiplayer();
        const back = (target) => ({ ...common.back, target });
        const net = (label, op, extra = {}) => ({ label, action: 'net', op, ...extra });
        if (!mp) return [common.back, common.close];
        if (page === 'onlineSafety') {
            const accepted = mp.hasAcceptedOnlineSafety();
            return [
                net('KEEP DETAILS PRIVATE', 'safetyInfo', { info: 'NO LOCATION / CONTACT ACCOUNTS' }),
                net('LEAVE IF PRESSURED', 'safetyInfo', { info: 'DO NOT MOVE CHAT ELSEWHERE' }),
                net('REPORT + BLOCK ABUSE', 'safetyInfo', { info: 'CONTACT STOPS BOTH WAYS' }),
                net('ROOM MUSIC FOLLOWS HOST', 'safetyInfo', { info: 'AUDIO HOSTS RECEIVE YOUR IP' }),
                net('START PRIVATE ROOM', 'safetyPrivate', { info: 'RECOMMENDED' }),
                net(mp.pendingSafetyJoin ? 'JOIN INVITATION' : accepted ? 'RETURN TO ONLINE' : 'SHOW ONLINE OPTIONS', 'safetyAccept', { info: accepted ? 'GUIDE ACCEPTED' : 'I UNDERSTAND' }),
                net(mp.connected ? 'RETURN TO ROOM' : 'STAY OFFLINE', 'safetyOffline'),
                common.close
            ];
        }
        if (page === 'online') {
            return [
                net('NETWORK', 'connection'),
                { label: 'MIC / WHO HEARS ME', action: 'page', target: 'voiceAudience', op: 'mic' },
                { label: 'LOOK', action: 'page', target: 'look', op: 'avatar' },
                { label: 'GESTURES', action: 'page', target: 'gestures' },
                { label: 'PEOPLE', action: 'page', target: 'people', op: 'peopleCount' },
                { label: 'SAFETY', action: 'page', target: 'safety' },
                net('NEW PRIVATE ROOM', 'privateRoom'),
                { label: 'JOIN ROOM', action: 'page', target: 'room' },
                net('BROWSE ROOMS', 'browseRooms'),
                ...(mp.connected && mp.client?.liveEventsSupported
                    ? [{ label: 'LIVE DJ EVENT', action: 'page', target: 'liveEvent' }] : []),
                common.back,
                common.close
            ];
        }
        if (page === 'liveEvent') {
            return [
                net(mp.hasLiveEvent ? 'LISTEN AGAIN' : 'CREATE LIVE EVENT', mp.hasLiveEvent ? 'eventListen' : 'eventCreate'),
                net('COPY AUDIENCE LINK', 'eventInvite'),
                net('COPY PRIVATE DJ LINK', 'eventDJ'),
                net('REPLACE DJ INVITATION', 'eventRotate'),
                net('END LIVE EVENT', 'eventEnd'),
                back('online'), common.close
            ];
        }
        if (page === 'rooms') {
            const rooms = mp.directoryRooms(), count = Math.ceil(rooms.length / 5);
            this._vrRoomsPage = Math.min(this._vrRoomsPage || 0, Math.max(0, count - 1));
            return [
                ...rooms.slice(this._vrRoomsPage * 5, this._vrRoomsPage * 5 + 5).map(room =>
                    net(`${room.private ? 'PRIVATE ' : ''}${room.room.replace(/^private-/i, '').slice(0, 16).toUpperCase()}`,
                        'joinListedRoom', { room: room.room, people: room.people, capacity: room.capacity, locked: room.locked, full: room.people >= room.capacity, inactive: !room.active })),
                net('REFRESH', 'browseRooms'),
                ...(rooms.length > 5 ? [net('NEXT PAGE', 'roomsPage')] : []),
                ...(mp.roomDirectory.next ? [net('MORE PUBLIC', 'moreRooms')] : []),
                net('PUBLIC LOBBY', 'lobby'),
                { label: 'PRIVATE CODE', action: 'page', target: 'room' },
                back('online'), common.close
            ];
        }
        if (page === 'look') {
            // Whom the relay may hand you as a random look, then a fresh roll from that pool.
            return [
                net('WOMEN', 'pool', { pool: 'women' }),
                net('MEN', 'pool', { pool: 'men' }),
                net('ANYONE', 'pool', { pool: 'any' }),
                net('NEW LOOK', 'avatar'),
                back('online'),
                common.close
            ];
        }
        if (page === 'room') {
            const digit = (d) => ({ label: d, action: 'net', op: 'digit', digit: d });
            const typed = (this._vrRoomDigits || '').length > 0;
            return [...['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'].map(digit),
                { label: typed ? '\u2190 DELETE' : '\u2190 BACK', action: 'net', op: 'roomBack' }, common.close];
        }
        if (page === 'gestures') {
            const emoji = ClubMultiplayer.EMOJI.filter(item => item !== '\u{1F57A}').map(item => ({ label: item, action: 'net', op: 'emoji', emoji: item }));
            return [
                net('WAVE', 'gesture', { gesture: 'wave' }),
                net('NOD', 'gesture', { gesture: 'nod' }),
                net('DANCE', 'gesture', { gesture: 'dance' }),
                ...emoji,
                back('online'),
                common.close
            ];
        }
        if (page === 'chat') {
            // No keyboard in a headset: one tap sends a ready-made message, shown in a bubble over your head.
            const phrases = ClubMultiplayer.QUICK_PHRASES.map(text => net(text.toUpperCase(), 'phrase', { phrase: text }));
            return [{ label: 'CHAT RECIPIENTS', action: 'page', target: 'chatAudience' },
                { label: 'RECENT MESSAGES', action: 'page', target: 'chatHistory' }, ...phrases, back('home'), common.close];
        }
        if (page === 'chatHistory') {
            const index = Math.min(this._vrChatOffset || 0, Math.max(0, mp.chat.length - 1));
            const entry = mp.chat[mp.chat.length - 1 - index];
            const text = entry ? `${entry.self ? 'You' : entry.name}${entry.restricted ? ' (selected)' : ''}: ${entry.text}` : 'No messages yet.';
            const lines = text.match(/.{1,42}(?:\s|$)|.{1,42}/gu) || [text];
            return [...lines.map(line => ({ label: line.trim(), action: 'creditText', detail: '' })),
                ...(mp.chat.length > 1 ? [net('OLDER MESSAGE', 'chatHistoryPage', { delta: 1 }),
                    net('NEWER MESSAGE', 'chatHistoryPage', { delta: -1 })] : []),
                back('chat'), common.close];
        }
        if (page === 'reports') {
            if (!mp.canModerate()) return [back('safety'), common.close];
            const index = Math.min(this._vrReportOffset || 0, Math.max(0, mp.moderationReports.length - 1));
            const report = mp.moderationReports[index];
            if (!report) return [{ label: 'NO SAFETY REPORTS', action: 'creditText', detail: '' }, back('safety'), common.close];
            const person = mp.people().find(item => item.id === report.target?.id);
            return [
                { label: `FROM: ${this._vrShortName(report.reporter?.name)}`, action: 'creditText', detail: '' },
                { label: `ABOUT: ${this._vrShortName(report.target?.name)}`, action: 'creditText', detail: '' },
                { label: (ClubMultiplayer.REPORT_REASONS[report.reason] || 'Safety concern').toUpperCase(), action: 'creditText', detail: '' },
                ...(person ? [net('REVIEW PERSON', 'select', { peer: person.id })] : []),
                net('DISMISS REPORT', 'dismissReport', { value: report.at }),
                ...(mp.moderationReports.length > 1 ? [net('NEXT REPORT', 'reportsPage')] : []),
                back('safety'), common.close
            ];
        }
        if (page === 'voiceAudience' || page === 'chatAudience') {
            const scope = page === 'voiceAudience' ? 'voice' : 'chat';
            const people = mp.people(), per = people.length > 7 ? 6 : 7;
            const pages = Math.max(1, Math.ceil(people.length / per));
            const indices = this._vrAudiencePages || (this._vrAudiencePages = {});
            const index = indices[scope] = Math.min(indices[scope] || 0, pages - 1);
            return [...(scope === 'voice' ? [net('MIC', 'mic')] : []), net('EVERYONE', 'audienceAll', { scope }),
                net('CLEAR SELECTION', 'audienceClear', { scope }),
                ...people.slice(index * per, index * per + per).map(person => net(this._vrShortName(person.name), 'audiencePeer', { scope, peer: person.id })),
                ...(pages > 1 ? [net('NEXT RECIPIENTS', 'audiencePage', { scope })] : []),
                back(scope === 'voice' ? 'online' : 'chat'), common.close];
        }
        if (page === 'safety') {
            return [
                net('PERSONAL SPACE', 'personalSpace'),
                net('LOWER MUSIC', 'duck'),
                net('NAME TAGS', 'nameTags'),
                net('MUTE ALL', 'muteAll'),
                net('LOCK ROOM', 'lock'),
                net('NOD TO NOD', 'autoNod'),
                net('UNBLOCK ALL', 'unblockAll'),
                net('REVIEW SAFETY GUIDE', 'reviewSafety'),
                ...(mp.canModerate?.() ? [{ label: 'SAFETY REPORTS', action: 'page', target: 'reports' }] : []),
                net('LEAVE ROOM', 'leave', { danger: true }),
                back('online'),
                common.close
            ];
        }
        if (page === 'people') {
            const people = mp.people();
            const per = 9;
            const offset = Math.min(this._vrPeopleOffset || 0, Math.max(0, people.length - 1));
            const slice = people.slice(offset, offset + per);
            const rows = slice.map(person => ({ label: this._vrShortName(person.name), action: 'person', op: 'select', peer: person.id }));
            if (people.length > per) rows.push({ label: 'MORE \u25B8', action: 'net', op: 'morePeople' });
            return [...rows, back('online'), common.close];
        }
        if (page === 'report') {
            const person = mp.people().find(item => item.id === this._vrReportPeer);
            if (!person) return [back('people'), common.close];
            const reasons = Object.entries(ClubMultiplayer.REPORT_REASONS).map(([reason, label]) =>
                net(label.toUpperCase(), 'reportReason', { reason }));
            return [...reasons, back('person'), common.close];
        }
        // person: one guest, chosen from the list
        const person = mp.people().find(item => item.id === this._vrPerson);
        if (!person) return [back('people'), common.close];
        const armedFor = (op) => this._vrArmed && this._vrArmed.key === `${op}:${person.id}` && this._vrArmed.until > Date.now();
        const rows = [
            net(person.muted ? 'UNMUTE' : 'MUTE', 'peerMute', { peer: person.id }),
            net('BLOCK', 'peerBlock', { peer: person.id }),
            net('REPORT + BLOCK', 'peerReport', { peer: person.id, danger: true })
        ];
        if (mp.isHost()) {
            if (!person.simulated) rows.push(net(mp.client.vjId === person.id ? 'REVOKE VJ PASS' : 'GIVE VJ PASS', 'peerVJ', { peer: person.id }));
            if (!person.simulated) rows.push(net(mp.client.moderatorId === person.id ? 'REVOKE MODERATOR' : 'MAKE MODERATOR', 'peerModerator', { peer: person.id }));
            rows.push(net(armedFor('host') ? 'SURE? MAKE HOST' : 'MAKE HOST', 'peerHost', { peer: person.id }));
        }
        if (mp.canModerate() && person.id !== mp.client.hostId) {
            rows.push(net(armedFor('kick') ? 'SURE? KICK' : 'KICK', 'peerKick', { peer: person.id, danger: true }));
            rows.push(net(armedFor('ban') ? 'SURE? BAN' : 'BAN', 'peerBan', { peer: person.id, danger: true }));
        }
        return [...rows, back('people'), common.close];
    }

    _vrShortName(name) {
        const text = String(name || 'Guest');
        return text.length > 11 ? `${text.slice(0, 10)}\u2026` : text;
    }

    /** What the second line of the header says on the ONLINE pages: the room and who is in it, or whom the page is about. */
    _vrNetSubtitle(page) {
        if (page === 'liveEvent') return this._multiplayer()?.liveEventStatus().slice(0, 65).toUpperCase() || 'LIVE DJ AUDIO';
        if (!VRClubUI.VR_NET_PAGES.includes(page)) return '';
        const mp = this._multiplayer();
        if (!mp) return '';
        if (page === 'rooms') return (mp.roomDirectory.loading ? 'CHECKING ROOMS...' : mp.roomDirectory.error ||
            (mp.roomDirectory.loaded && !mp.directoryRooms().length ? 'NO ROOMS: JOIN LOBBY OR ENTER A PRIVATE CODE' :
                'PUBLIC ROOMS + YOUR SAVED PRIVATE CODES')).slice(0, 56).toUpperCase();
        if (page === 'voiceAudience' || page === 'chatAudience') {
            return `TO: ${mp.audienceLabel(page === 'voiceAudience' ? 'voice' : 'chat')}`.slice(0, 56).toUpperCase();
        }
        if (page === 'person') {
            const person = mp.people().find(item => item.id === this._vrPerson);
            return person ? this._vrShortName(person.name).toUpperCase() : '';
        }
        if (page === 'gestures') return mp.connected ? 'WAVE, NOD, DANCE OR SEND AN EMOJI' : 'JOIN A ROOM FIRST: ONLINE \u2192 NETWORK';
        if (page === 'chat') {
            if (!mp.connected) return 'JOIN A ROOM FIRST: ONLINE \u2192 NETWORK';
            const last = mp.chat.filter(entry => !entry.self).at(-1);
            return `TO: ${mp.audienceLabel('chat')}${last ? ` | ${this._vrShortName(last.name)}: ${last.text}` : ''}`.toUpperCase().slice(0, 52);
        }
        if (page === 'look') {
            return mp.avatarPool === 'any' ? 'RANDOM LOOK: ANYONE' : `RANDOM LOOK: ${mp.avatarPool.toUpperCase()}`;
        }
        if (page === 'room') {
            const digits = (this._vrRoomDigits || '').padEnd(6, '_');
            return `ROOM CODE  ${digits.slice(0, 3)} ${digits.slice(3)}`;
        }
        return mp.statusText().replace(/^In /, '').slice(0, 56).toUpperCase();
    }

    /** Which toggles are lit: a button is "on" when its setting is. */
    _vrNetActive(button) {
        const mp = this._multiplayer();
        if (!mp) return false;
        switch (button.op) {
            case 'audienceAll': return mp[`${button.scope}Audience`] === null;
            case 'audiencePeer': return !!mp[`${button.scope}Audience`]?.includes(button.peer);
            case 'connection': return mp.connected;
            case 'mic': return mp.micEnabled;
            case 'personalSpace': return mp.personalSpace;
            case 'nameTags': return mp.nameTags;
            case 'duck': return mp.duckForVoice;
            case 'muteAll': return mp.muteAll;
            case 'lock': return mp.locked;
            case 'autoNod': return mp.autoNod;
            case 'pool': return mp.avatarPool === button.pool;
            case 'gesture': return button.gesture === 'dance' && mp.dancing;
            case 'peerMute': {
                const person = mp.people().find(item => item.id === button.peer);
                return !!(person && person.muted);
            }
            default: return false;
        }
    }

    /** The small second line on a button. */
    _vrNetValue(button, active) {
        const mp = this._multiplayer();
        if (!mp) return '';
        if (button.op?.startsWith('event')) {
            if (!mp.connected) return 'JOIN A ROOM FIRST';
            if (!mp.client.liveEventsSupported) return 'UPDATE RELAY';
            if (mp.liveEventBusy) return 'WORKING...';
            if (button.op === 'eventCreate') return mp.isHost() ? 'UP TO 8 ROOMS' : 'HOST ONLY';
            if (['eventDJ', 'eventRotate', 'eventEnd'].includes(button.op) && !mp.liveEvent?.canManage) return 'EVENT OWNER ONLY';
            return button.op === 'eventDJ' ? 'PRIVATE: DJ ONLY' : mp.hasLiveEvent ? 'EVENT AUDIO' : 'CREATE EVENT FIRST';
        }
        switch (button.op) {
            case 'joinListedRoom': return button.locked ? 'LOCKED' : button.full ? 'FULL' : button.inactive ? 'START ROOM' : `${button.people}/${button.capacity} HERE`;
            case 'peerHost': return !mp.isHost() ? 'HOST ONLY' : !mp.client.hostTransferSupported ? 'UPDATE RELAY' : 'YOU STAY IN ROOM';
            case 'peerVJ': return !mp.isHost() ? 'HOST ONLY' : !mp.client.vjPassSupported ? 'UPDATE RELAY' : 'LIGHTS ONLY';
            case 'peerModerator': return !mp.isHost() ? 'HOST ONLY' : !mp.client.moderatorRoleSupported ? 'UPDATE RELAY' : 'REPORTS / KICK / BAN';
            case 'browseRooms': return mp.roomDirectory.loading ? 'CHECKING...' : 'PUBLIC + SAVED PRIVATE';
            case 'audienceAll': return active ? 'SELECTED' : '';
            case 'audienceClear': return 'SEND TO NOBODY';
            case 'audiencePeer': return !mp.canRestrictAudience() ? 'PRIVATE ROOMS ONLY' : active ? 'SELECTED' : 'NOT SELECTED';
            case 'safetyInfo': return button.info || '';
            case 'safetyPrivate': return 'RECOMMENDED';
            case 'safetyAccept': return 'I UNDERSTAND';
            case 'connection': return mp.connected ? 'CONNECTED' : mp.connecting ? 'CONNECTING' : 'OFFLINE';
            case 'mic': return !mp.connected ? 'JOIN A ROOM FIRST' : active ? (mp.client?.localSpeaking ? 'YOU ARE SPEAKING' : mp.voiceAudience === null ? 'ON: EVERYONE' : 'ON: SELECTED') : 'MIC OFF';
            case 'chatUnread': return mp.chatUnread ? ` NEW` : '';
            case 'duck': return active ? 'WHILE TALKING' : 'OFF';
            case 'phrase': return !mp.connected ? 'JOIN A ROOM FIRST' : '';
            case 'avatar': return mp.selfAvatar ? (this.characterLabel?.(mp.selfAvatar) || ClubMultiplayer.AVATAR_LABELS[mp.selfAvatar] || '').split(',')[0].toUpperCase() : '';
            case 'peopleCount': return mp.connected ? `${mp.client.peerCount} HERE` : '';
            case 'personalSpace': case 'muteAll': case 'autoNod': case 'nameTags': return active ? 'ON' : 'OFF';
            case 'lock': return !mp.isHost() ? 'HOST ONLY' : active ? 'LOCKED' : 'OPEN';
            case 'unblockAll': return `${mp.blockedList().length} BLOCKED`;
            case 'pool': return active ? 'SELECTED' : '';
            case 'gesture': return button.gesture === 'dance' ? (active ? 'DANCING' : '') : '';
            case 'select': {
                const person = mp.people().find(item => item.id === button.peer);
                if (!person) return '';
                return person.speaking ? 'SPEAKING' : person.muted ? 'MUTED' : person.isHost ? 'HOST' : '';
            }
            default: return '';
        }
    }

    /** One tap on an ONLINE button. Everything it does is a ClubMultiplayer call; this only says what happened. */
    async _runVRNetworkAction(button) {
        const mp = this._multiplayer();
        if (!mp) return;
        const needConnection = () => {
            if (mp.connected) return false;
            this.showErrorMessage('Join a room first: ONLINE \u2192 NETWORK');
            return true;
        };
        switch (button.op) {
            case 'eventListen':
                if (needConnection()) return;
                mp.retryLiveEventAudio();
                this.showErrorMessage(mp.liveEventStatus());
                return;
            case 'eventCreate': case 'eventRotate': case 'eventEnd': case 'eventInvite': case 'eventDJ': {
                if (needConnection()) return;
                try {
                    if (button.op === 'eventInvite' || button.op === 'eventDJ') {
                        if (!mp.hasLiveEvent) throw new Error('Create a live event first.');
                        await navigator.clipboard.writeText(button.op === 'eventDJ' ? mp.publisherInviteUrl() : mp.inviteUrl());
                        this.showErrorMessage(button.op === 'eventDJ' ? 'Private DJ link copied. Send it only to the DJ.' : 'Audience link copied.');
                    } else {
                        if (button.op !== 'eventCreate') {
                            if (!this._vrArmed || this._vrArmed.key !== button.op || this._vrArmed.until < Date.now()) {
                                this._vrArmed = { key: button.op, until: Date.now() + 4000 };
                                this.showErrorMessage('Press again within four seconds to confirm.');
                                return;
                            }
                            this._vrArmed = null;
                        }
                        await mp.manageLiveEvent(button.op === 'eventCreate' ? 'create' : button.op === 'eventRotate' ? 'rotate' : 'end');
                        this.showErrorMessage(mp.liveEventStatus());
                    }
                } catch (error) { this.showErrorMessage(error.message); }
                this._showVRQuickMenuPage('liveEvent');
                return;
            }
            case 'safetyAccept':
                mp.acceptOnlineSafety();
                this._showVRQuickMenuPage('online');
                return;
            case 'safetyPrivate':
                mp.cancelPendingSafetyJoin();
                mp.acceptOnlineSafety();
                mp.joinNewPrivateRoom();
                this.showErrorMessage(`Private room ${mp.currentRoom.replace('private-', '')}: share this code only with people you trust`);
                this._showVRQuickMenuPage('online');
                return;
            case 'reviewSafety':
                this._showVRQuickMenuPage('onlineSafety');
                return;
            case 'safetyOffline':
                mp.cancelPendingSafetyJoin();
                this._showVRQuickMenuPage('home');
                return;
            case 'chatHistoryPage':
                this._vrChatOffset = Math.min(Math.max(0, mp.chat.length - 1), Math.max(0, (this._vrChatOffset || 0) + button.delta));
                this._showVRQuickMenuPage('chatHistory');
                return;
            case 'reportsPage':
                this._vrReportOffset = ((this._vrReportOffset || 0) + 1) % Math.max(1, mp.moderationReports.length);
                this._showVRQuickMenuPage('reports');
                return;
            case 'dismissReport':
                mp.dismissModerationReport(button.value);
                this._showVRQuickMenuPage('reports');
                return;
            case 'audiencePage': {
                const pages = Math.max(1, Math.ceil(mp.people().length / 6));
                this._vrAudiencePages[button.scope] = ((this._vrAudiencePages[button.scope] || 0) + 1) % pages;
                this._showVRQuickMenuPage(`${button.scope}Audience`);
                return;
            }
            case 'browseRooms':
            case 'moreRooms':
                this._showVRQuickMenuPage('rooms');
                await mp.refreshRooms({ more: button.op === 'moreRooms' });
                if (mp.roomDirectory.error) this.showErrorMessage(mp.roomDirectory.error);
                break;
            case 'roomsPage': {
                const pages = Math.max(1, Math.ceil(mp.directoryRooms().length / 5));
                this._vrRoomsPage = ((this._vrRoomsPage || 0) + 1) % pages;
                this._showVRQuickMenuPage('rooms');
                return;
            }
            case 'joinListedRoom':
                if (mp.joinListedRoom(button.room)) {
                    this.showErrorMessage(`Joining ${mp.roomLabel(button.room)}...`);
                    this._showVRQuickMenuPage('online');
                } else this.showErrorMessage(mp.roomDirectory.error);
                break;
            case 'audienceAll':
                if (!needConnection()) mp.setAudience(button.scope, null);
                break;
            case 'audienceClear':
                if (!needConnection()) mp.setAudience(button.scope, []);
                break;
            case 'audiencePeer':
                if (!needConnection()) mp.toggleAudiencePeer(button.scope, button.peer);
                break;
            case 'connection': {
                const wasOn = mp.connected || mp.connecting;
                mp.toggleConnection();
                this.showErrorMessage(wasOn ? 'Left the room' : `Joining "${mp.currentRoom}"\u2026`);
                break;
            }
            case 'mic':
                if (needConnection()) break;
                this.showErrorMessage((await mp.toggleMic())
                    ? (mp.duckForVoice ? 'Microphone on: others hear you, and the music is lowered' : 'Microphone on: others hear you')
                    : 'Microphone off');
                break;
            case 'avatar':
                if (!needConnection()) { mp.rerollAvatar(); this.showErrorMessage('Picking a new look\u2026'); }
                break;
            case 'phrase':
                if (!needConnection() && mp.sendChat(button.phrase)) this.showErrorMessage(`Sent: ${button.phrase}`);
                break;
            case 'duck': mp.setDuckForVoice(!mp.duckForVoice); break;
            case 'pool':
                mp.setAvatarPool(button.pool);
                this.showErrorMessage(button.pool === 'any' ? 'Random looks: anyone' : `Random looks: ${button.pool}`);
                break;
            case 'privateRoom':
                mp.joinNewPrivateRoom();
                this.showErrorMessage(`Private room ${mp.currentRoom.replace('private-', '')}: tell friends this code (ONLINE \u2192 JOIN ROOM)`);
                break;
            case 'digit': {
                this._vrRoomDigits = ((this._vrRoomDigits || '') + button.digit).slice(0, 6);
                if (this._vrRoomDigits.length < 6) break;
                const code = this._vrRoomDigits;
                this._vrRoomDigits = '';
                mp.joinRoom(code);
                this.showErrorMessage(`Joining room ${code.slice(0, 3)} ${code.slice(3)}\u2026`);
                this._showVRQuickMenuPage('online');
                return;
            }
            case 'roomBack':
                if (this._vrRoomDigits) { this._vrRoomDigits = this._vrRoomDigits.slice(0, -1); break; }
                this._showVRQuickMenuPage('online');
                return;
            case 'lobby':
                mp.joinLobby();
                this.showErrorMessage('Joining the public lobby\u2026');
                break;
            case 'gesture':
                if (!needConnection()) mp.sendGesture(button.gesture);
                break;
            case 'emoji':
                if (!needConnection()) mp.sendEmoji(button.emoji);
                break;
            case 'select':
                this._vrPerson = button.peer;
                this._showVRQuickMenuPage('person');
                return;
            case 'morePeople': {
                const total = mp.people().length;
                this._vrPeopleOffset = ((this._vrPeopleOffset || 0) + 9) % Math.max(1, total);
                break;
            }
            case 'peerMute': mp.togglePeerMute(button.peer); break;
            case 'peerBlock': {
                const person = mp.people().find(item => item.id === button.peer);
                if (mp.blockPeer(button.peer)) this.showErrorMessage(`Blocked ${person ? person.name : 'guest'}: you will not see or hear each other`);
                this._vrPerson = null;
                this._showVRQuickMenuPage('people');
                return;
            }
            case 'peerReport':
                this._vrReportPeer = button.peer;
                this._showVRQuickMenuPage('report');
                return;
            case 'reportReason': {
                const person = mp.people().find(item => item.id === this._vrReportPeer);
                const reason = button.reason;
                if (person && mp.reportAndBlockPeer(person.id, reason)) {
                    this.showErrorMessage('Reported and blocked: you cannot see, hear or contact each other.');
                }
                this._vrReportPeer = null;
                this._showVRQuickMenuPage('people');
                return;
            }
            case 'peerVJ':
                mp.setVJPass(mp.client.vjId === button.peer ? null : button.peer);
                break;
            case 'peerModerator':
                mp.setModerator(mp.client.moderatorId === button.peer ? null : button.peer);
                break;
            case 'peerKick':
            case 'peerBan':
            case 'peerHost': {
                const kind = button.op === 'peerHost' ? 'host' : button.op === 'peerKick' ? 'kick' : 'ban';
                if (kind === 'host' && (!mp.isHost() || !mp.client?.hostTransferSupported || !mp.client.peers.has(button.peer))) {
                    mp.transferHost(button.peer);
                    return;
                }
                const key = `${kind}:${button.peer}`;
                if (!this._vrArmed || this._vrArmed.key !== key || this._vrArmed.until < Date.now()) {
                    this._vrArmed = { key, until: Date.now() + 4000 };
                    setTimeout(() => { if (!this._disposed) this._refreshVRQuickMenu(); }, 4100);
                    break;
                }
                this._vrArmed = null;
                if (kind === 'host') {
                    if (!mp.transferHost(button.peer)) return;
                    this.showErrorMessage('Host transfer requested. You stay in the room.');
                } else {
                    if (!(kind === 'kick' ? mp.kickPeer(button.peer) : mp.banPeer(button.peer))) {
                        this.showErrorMessage('This moderation action is no longer available.');
                        return;
                    }
                    this.showErrorMessage(kind === 'kick' ? 'Guest removed from the room' : 'Guest banned from this room');
                }
                this._vrPerson = null;
                this._showVRQuickMenuPage('people');
                return;
            }
            case 'personalSpace': mp.setPersonalSpace(!mp.personalSpace); break;
            case 'nameTags': mp.setNameTags(!mp.nameTags); break;
            case 'muteAll': mp.setMuteAll(!mp.muteAll); break;
            case 'autoNod': mp.setAutoNod(!mp.autoNod); break;
            case 'lock':
                if (!mp.isHost()) this.showErrorMessage('Only the host can lock the room');
                else mp.setLocked(!mp.locked);
                break;
            case 'unblockAll': {
                const count = mp.unblockAll();
                this.showErrorMessage(count ? `Unblocked ${count} guest${count === 1 ? '' : 's'}` : 'Nobody is blocked');
                break;
            }
            case 'leave':
                mp.disconnect();
                this.showErrorMessage('Left the room');
                break;
            default: break;
        }
        this._refreshVRQuickMenu();
    }

    _socialWheelItems() {
        const state = this._vrSocialWheel;
        if (state.page === 'home') return [
            { label: 'CHAT', target: 'chat' }, { label: 'REACTIONS', target: 'gestures' },
            { label: 'MICROPHONE', target: 'voiceAudience' }, { label: 'CLOSE', close: true }
        ];
        const items = this._vrQuickMenuPageDefinitions(state.page)
            .filter(item => item && item.action !== 'back' && item.action !== 'close');
        const start = state.offset * 5;
        return [...items.slice(start, start + 5),
            ...(items.length > 5 ? [{ label: 'MORE', more: true }] : []),
            { label: 'BACK', target: state.page === 'chatAudience' ? 'chat' : 'home' },
            { label: 'CLOSE', close: true }];
    }

    _pressVRSocialWheel(x = 0, y = 0) {
        if (!this.isInVRMode) return;
        if (!this._multiplayer()?.connected) {
            this.showErrorMessage('Join a room in People to use chat, reactions and your microphone.');
            return;
        }
        if (!this._vrSocialWheel?.open) {
            this._createVRSocialWheel();
            const state = this._vrSocialWheel;
            this.toggleVRQuickMenu(false);
            state.page = 'home'; state.offset = 0; state.selected = -1; state.open = true;
            state.x = x; state.y = y; state.armed = Math.hypot(x, y) < 0.25; state.busy = false;
            this._vrQuickMenuRoot.setEnabled(false);
            this._placeVRQuickMenu(this.vrHelper.baseExperience.camera);
            state.mesh.position.copyFrom(this._vrQuickMenuRoot.position);
            state.mesh.rotation.copyFrom(this._vrQuickMenuRoot.rotation);
            state.mesh.setEnabled(true);
            this._restoreVRSocialTurning();
            state.turning = [];
            for (const feature of [this.movementFeature, this.vrHelper.teleportation]) {
                if (!feature) continue;
                state.turning.push({ feature, enabled: feature.rotationEnabled });
                feature.rotationEnabled = false;
            }
            this._drawVRSocialWheel();
            return;
        }
        const state = this._vrSocialWheel;
        if (state.busy || !state.armed) return;
        const item = this._socialWheelItems()[state.selected];
        if (!item) return;
        if (item.close) { this._closeVRSocialWheel(); return; }
        state.selected = -1;
        state.armed = false;
        if (item.more) {
            const count = this._vrQuickMenuPageDefinitions(state.page).filter(item =>
                item && item.action !== 'back' && item.action !== 'close').length;
            state.offset = (state.offset + 1) % Math.ceil(count / 5);
        } else if (item.target) {
            state.page = item.target; state.offset = 0;
        } else {
            state.busy = true;
            void this._runVRNetworkAction(item)
                .catch(error => this.showErrorMessage(`Social action failed: ${error.message}`))
                .finally(() => {
                    state.busy = false;
                    if (state.open) this._drawVRSocialWheel();
                });
        }
        this._drawVRSocialWheel();
    }

    _createVRSocialWheel() {
        if (this._vrSocialWheel) return;
        this._createVRQuickMenu();
        const texture = new BABYLON.DynamicTexture('vrSocialWheelTexture', { width: 1024, height: 1024 }, this.scene, false);
        texture.hasAlpha = true;
        const material = this.materialFactory.createStandardMaterial('vrSocialWheelMaterial', {
            emissiveTexture: texture, disableLighting: true
        });
        material.diffuseTexture = texture;
        material.useAlphaFromDiffuseTexture = true;
        material.disableDepthWrite = true;
        material.backFaceCulling = false;
        const mesh = BABYLON.MeshBuilder.CreatePlane('vrSocialWheel', { size: 1.35 }, this.scene);
        mesh.material = material;
        mesh.renderingGroupId = 2;
        mesh.isPickable = false;
        mesh.setEnabled(false);
        this._vrSocialWheel = {
            mesh, texture, open: false, selected: -1, x: 0, y: 0,
            armed: true, busy: false, turning: []
        };
        const unsubscribe = this._multiplayer().onChange(() => {
            if (!this._multiplayer().connected) this._closeVRSocialWheel(true);
            else if (this._vrSocialWheel.open) {
                this._vrSocialWheel.selected = -1;
                this._drawVRSocialWheel();
            }
        });
        this.scene.onDisposeObservable.add(() => {
            this._closeVRSocialWheel(true);
            unsubscribe();
            texture.dispose();
        });
    }

    _moveVRSocialWheel(x, y) {
        const state = this._vrSocialWheel;
        if (!state) return;
        state.x = x; state.y = y;
        if (!state.open) {
            if (Math.hypot(x, y) < 0.25) this._restoreVRSocialTurning();
            return;
        }
        // Babylon's movement feature registers its axis observer before the UI bindings,
        // so it may have already copied this event into its private turn state. Clear that
        // cached value as well as gating future events in _xrMovementOptions().
        if (this.movementFeature?._movementState) {
            this.movementFeature._movementState.rotateX = 0;
            this.movementFeature._movementState.rotateY = 0;
        }
        const magnitude = Math.hypot(x, y);
        if (magnitude < 0.25) {
            const changed = !state.armed || state.selected !== -1;
            state.armed = true;
            state.selected = -1;
            if (changed) this._drawVRSocialWheel();
            return;
        }
        if (!state.armed || state.busy) return;
        const items = this._socialWheelItems();
        const angle = (Math.atan2(x, -y) + Math.PI * 2) % (Math.PI * 2);
        const selected = magnitude < 0.5 ? -1 : Math.round(angle / (Math.PI * 2 / items.length)) % items.length;
        if (selected === state.selected) return;
        state.selected = selected;
        this._drawVRSocialWheel();
    }

    _closeVRSocialWheel(restoreNow = false) {
        const state = this._vrSocialWheel;
        if (!state) return;
        state.open = false;
        state.busy = false;
        state.selected = -1;
        state.mesh.setEnabled(false);
        if (restoreNow || Math.hypot(state.x, state.y) < 0.25) this._restoreVRSocialTurning();
    }

    _restoreVRSocialTurning() {
        const state = this._vrSocialWheel;
        if (!state) return;
        for (const { feature, enabled } of state.turning) feature.rotationEnabled = enabled;
        state.turning = [];
    }

    _drawVRSocialWheel() {
        const state = this._vrSocialWheel, items = this._socialWheelItems();
        const ctx = state.texture.getContext();
        ctx.clearRect(0, 0, 1024, 1024);
        const step = Math.PI * 2 / items.length;
        items.forEach((item, index) => {
            const angle = index * step - Math.PI / 2;
            ctx.beginPath(); ctx.moveTo(512, 512);
            ctx.arc(512, 512, 490, angle - step / 2, angle + step / 2);
            ctx.closePath();
            const active = item.op && this._vrNetActive(item);
            ctx.fillStyle = index === state.selected ? '#16818a' : active ? '#164653' : '#141e30';
            ctx.fill(); ctx.strokeStyle = '#708899'; ctx.lineWidth = 3; ctx.stroke();
            ctx.fillStyle = item.danger ? '#ffb4b4' : '#ffffff';
            ctx.textAlign = 'center'; ctx.font = 'bold 25px sans-serif';
            const x = 512 + Math.cos(angle) * 330, y = 512 + Math.sin(angle) * 330;
            const words = String(item.label).split(/\s+/);
            let top = '', bottom = '';
            for (const word of words) {
                if (!bottom && `${top} ${word}`.trim().length <= 14) top = `${top} ${word}`.trim();
                else bottom = `${bottom} ${word}`.trim();
            }
            if (bottom.length > 14) bottom = `${bottom.slice(0, 13)}\u2026`;
            ctx.fillText(top, x, y - (bottom ? 13 : 0));
            if (bottom) ctx.fillText(bottom, x, y + 16);
            if (item.op) {
                ctx.font = '20px sans-serif'; ctx.fillStyle = '#a7eff1';
                ctx.fillText(this._vrNetValue(item, active), x, y + (bottom ? 44 : 30));
            }
        });
        ctx.beginPath(); ctx.arc(512, 512, 165, 0, Math.PI * 2);
        ctx.fillStyle = '#080f1a'; ctx.fill();
        ctx.fillStyle = '#ffffff'; ctx.font = 'bold 28px sans-serif';
        const titles = {
            home: 'SOCIAL', gestures: 'REACTIONS', chat: 'CHAT',
            voiceAudience: 'MICROPHONE', chatAudience: 'CHAT AUDIENCE'
        };
        ctx.fillText(titles[state.page] || state.page.toUpperCase(), 512, 485);
        ctx.font = '22px sans-serif';
        if (state.busy) {
            ctx.fillText('WORKING...', 512, 535);
        } else if (!state.armed) {
            ctx.fillText('CENTER STICK', 512, 535);
        } else {
            ctx.fillText('TILT TO CHOOSE', 512, 525);
            ctx.fillText('CLICK TO SELECT', 512, 555);
        }
        state.texture.update();
    }
}
window.VRClubSocialUI = VRClubSocialUI;
