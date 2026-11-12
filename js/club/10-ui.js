'use strict';

class VRClubUI extends window.VRClubSocialUI {

    _seatFromPick(pickResult) {
        const metadata = pickResult?.pickedMesh?.metadata;
        const seats = metadata?.vrclubSeats;
        if (!Array.isArray(seats) || !seats.length) return null;
        if (seats.length === 1 || !pickResult.pickedPoint) return seats[0];
        const point = pickResult.pickedPoint;
        let best = seats[0], bestDistance = Infinity;
        for (const seat of seats) {
            const distance = (point.x - seat.x) ** 2 + (point.z - seat.z) ** 2;
            if (distance < bestDistance) { best = seat; bestDistance = distance; }
        }
        return best;
    }

    _pressSeat(pickResult) {
        const seat = this._seatFromPick(pickResult);
        if (!seat) return false;
        if (this._activeSeat?.id === seat.id) this.standFromSeat(true);
        else this.sitAtSeat(seat);
        return true;
    }

    _simulatedSeatOccupant(id) {
        const client = this.networkManager;
        if (!client?.connected || client.room !== 'private-000032') return null;
        for (const [peerId, peer] of client.peers) {
            if (peer.simulated && peer.state?.seat === id && peer.state.seated) return { id: peerId, peer };
        }
        return null;
    }

    _cancelDevSeatWait() {
        if (this._devSeatWaitObserver) this.scene.onBeforeRenderObservable.remove(this._devSeatWaitObserver);
        this._devSeatWaitObserver = null;
        this._devSeatWait = null;
    }

    _requestDevSeatYield(id) {
        if (!this._simulatedSeatOccupant(id)) return false;
        if (!this.networkManager.requestDevSeat(id)) return false;
        this.showErrorMessage('The simulated guest is making room for you.');
        return true;
    }

    sitAtSeat(seat) {
        if (!seat || !Number.isFinite(seat.x) || !Number.isFinite(seat.z)) return false;
        const door = this._restroomDoors?.find(door => door.seatId === seat.id);
        if (door) {
            this._scanRemoteToilets();
            if (door.remote) {
                this.showErrorMessage('This toilet is occupied');
                return false;
            }
            const fixtures = this.restroomInteractions;
            if (fixtures && (!fixtures.state.lids[door.index] || fixtures.state.seats[door.index])) {
                this.showErrorMessage('Raise the toilet lid and lower the seat before sitting.');
                return false;
            }
        }
        const occupant = this._simulatedSeatOccupant(seat.id);
        if (occupant) {
            this._cancelDevSeatWait();
            if (!this._requestDevSeatYield(seat.id)) return false;
            const request = this._devSeatWait = { seat, id: occupant.id, client: this.networkManager, at: performance.now() };
            this._devSeatWaitObserver = this.scene.onBeforeRenderObservable.add(() => {
                if (this._disposed || !this.networkManager?.connected || this.networkManager !== request.client) {
                    this._cancelDevSeatWait(); return;
                }
                if (performance.now() - request.at > 15000) {
                    this._cancelDevSeatWait();
                    this.showErrorMessage('That guest cannot move clear yet. Please try another seat.');
                    return;
                }
                if (this._simulatedSeatOccupant(seat.id)) return;
                const peer = this.avatarManager?.remotes.get(request.id);
                if (peer && Math.hypot(peer.root.position.x - seat.x, peer.root.position.z - seat.z) < 0.85) return;
                this._cancelDevSeatWait();
                this.sitAtSeat(seat);
            });
            return false;
        }
        this._cancelDevSeatWait();
        this._activeSeat = seat;
        // A seat in the room has its own seated pose: Seated mode's lift would double the height.
        if (this._seatLift) this._seatLift.update(0, 0, false, 0, true);
        this._seatLiftMoving = false;
        const camera = this._playerCamera();
        if (camera) {
            camera.position.x = seat.viewX;
            camera.position.z = seat.viewZ;
            if (this.isInVRMode) {
                const height = this._xrHeadHeight();
                if (Number.isFinite(height)) camera.position.y = seat.floorY + height;
                if (camera._deferOnly && camera._deferredUpdated) camera._deferredPositionUpdate.copyFrom(camera.position);
            } else {
                camera.position.y = seat.floorY + 1.2;
                const target = this._seatLookTarget || (this._seatLookTarget = new BABYLON.Vector3());
                target.set(seat.x + Math.sin(seat.facing) * 2, seat.floorY + 1.15, seat.z + Math.cos(seat.facing) * 2);
                if (typeof camera.setTarget === 'function') camera.setTarget(target);
            }
        }
        this._walkLevel = seat.floorY;
        if (this.jumpState) this.jumpState.active = false;
        this.showErrorMessage(`Sitting on ${seat.label}. Move or select it again to stand.`);
        return true;
    }

    standFromSeat(notify = true) {
        this._cancelDevSeatWait();
        const seat = this._activeSeat;
        if (!seat) return false;
        this._activeSeat = null;
        if (!this.isInVRMode) {
            const camera = this._playerCamera();
            if (camera) camera.position.y = seat.floorY + 1.7;
        }
        if (notify) this.showErrorMessage('Standing up');
        return true;
    }

    /**
     * Pointer routing for everything pickable in the world: the VR quick menu, its seek bar and the VJ desk at the
     * DJ table (js/vjDesk.js), plus the room's seats. A mouse click and a controller ray use the same path.
     */
    setupVJControlInteraction() {
        // A press that throws inside the XR frame callback stops the headset's frame loop (the picture freezes while the
        // music plays on), so nothing a pointer does may escape these handlers: it is logged and the frame carries on.
        const guarded = (name, action) => {
            try { action(); } catch (error) {
                log.warn(`Pointer ${name} failed:`, error);
                if (this.recordDiagnostic) this.recordDiagnostic('error', `Pointer ${name} failed: ${error.message}`);
            }
        };
        // Both hands have a live pointer, so a drag (the seek bar, a desk fader or knob) belongs to the pointer that started it:
        // the other hand's move or release must not steer it or end it. Events without a pointer id (a mouse stub) match anything.
        const dragging = () => !!((this._vrSeek && this._vrSeek.drag) || this._vjDeskDrag || this._vjDeskSeek);
        const foreign = evt => this._dragPointer !== undefined && evt && evt.pointerId !== undefined && evt.pointerId !== this._dragPointer;
        this.scene.skipPointerMovePicking = true;
        this.scene.onPointerDown = (evt, pickResult) => guarded('press', () => {
            if (!pickResult || !pickResult.hit || !pickResult.pickedMesh) return;
            // A right-click puts a desk knob or the crossfader back to its default (a controller uses A / X, see the bindings).
            if (evt && evt.button === 2 && typeof this.resetVJDeskAt === 'function' && this.resetVJDeskAt(pickResult)) return;
            const vrMenuButton = this._vrQuickMenuButtons &&
                this._vrQuickMenuButtons.find(button => button.mesh === pickResult.pickedMesh);
            if (this._vrSeek && pickResult.pickedMesh === this._vrSeek.mesh) {
                this._beginVRSeek(pickResult);
                this._dragPointer = dragging() ? (evt && evt.pointerId) : undefined;
                this.scene.skipPointerMovePicking = !dragging();
                return;
            }
            if (vrMenuButton) {
                this._activateVRQuickMenuButton(vrMenuButton);
                return;
            }
            if (typeof this._pressStallDoor === 'function' && this._pressStallDoor(pickResult)) return;
            if (this.restroomInteractions?.press(pickResult)) return;
            if (this._pressGuestTouchpoint?.(pickResult)) return;
            if (this.pressSessionExperience?.(pickResult)) return;
            if (this._pressSeat(pickResult)) return;
            if (typeof this.pressVJDesk === 'function') this.pressVJDesk(pickResult);
            this._dragPointer = dragging() ? (evt && evt.pointerId) : undefined;
            this.scene.skipPointerMovePicking = !dragging();
        });

        this.scene.onPointerUp = evt => guarded('release', () => {
            if (foreign(evt)) return;
            this._dragPointer = undefined;
            this._endVRSeek();
            if (typeof this.releaseVJDesk === 'function') this.releaseVJDesk();
            this.scene.skipPointerMovePicking = true;
        });

        this.scene.onPointerMove = (evt, pickResult) => guarded('move', () => {
            if (foreign(evt)) return;
            this._moveVRSeek(pickResult);
            if (typeof this.dragVJDesk === 'function') this.dragVJDesk(pickResult);
        });
    }

    _ensureAudioElement() {
        if (this.audioElement) return this.audioElement;
        const audio = document.createElement('audio');
        audio.crossOrigin = 'anonymous';
        audio.preload = 'auto';
        audio.loop = true;
        audio.style.display = 'none';
        document.body.appendChild(audio);
        this.audioElement = audio;
        this._watchAudioStream(audio);
        return audio;
    }

    /**
     * Internet radio drops mid-session, after which the element simply goes quiet
     * and the show falls back to synthetic beats with no explanation. Watch for a
     * media error, or for an un-paused stream whose clock stops advancing, and
     * reconnect with bounded backoff. Local files and user pauses are left alone.
     */
    _watchAudioStream(audio) {
        const recovery = this._streamRecovery = { attempts: 0, timer: null, lastTime: -1, stalledFor: 0, hasPlayed: false, waiting: false };
        this._onAudioWaiting = () => {
            if (recovery.waiting) return;
            recovery.waiting = true;
            if (typeof this.recordDiagnostic === 'function') {
                this.recordDiagnostic('audio', 'Audio stream waiting for data (buffering)');
            }
        };
        this._onAudioFault = () => {
            const code = audio.error && audio.error.code ? ` (error code ${audio.error.code})` : '';
            if (typeof this.recordDiagnostic === 'function') {
                this.recordDiagnostic('audio', `Audio media error${code}`);
            }
            this._recoverAudioStream('error');
        };
        this._onAudioPlaying = () => {
            if (recovery.waiting) {
                recovery.waiting = false;
                if (typeof this.recordDiagnostic === 'function') {
                    this.recordDiagnostic('audio', 'Audio stream resumed after buffering');
                }
            }
            recovery.attempts = 0;
            recovery.stalledFor = 0;
            recovery.hasPlayed = true;
        };
        audio.addEventListener('waiting', this._onAudioWaiting);
        audio.addEventListener('error', this._onAudioFault);
        audio.addEventListener('playing', this._onAudioPlaying);
        this._audioWatchdog = setInterval(() => {
            if (this._audioKind !== 'stream' || audio.paused || recovery.timer) {
                recovery.stalledFor = 0;
                recovery.lastTime = audio.currentTime;
                return;
            }
            recovery.stalledFor = audio.currentTime === recovery.lastTime ? recovery.stalledFor + 2 : 0;
            recovery.lastTime = audio.currentTime;
            if (recovery.stalledFor >= VRClubUI.STREAM_STALL_SECONDS) {
                recovery.stalledFor = 0;
                this._recoverAudioStream('stall');
            }
        }, 2000);
    }

    _recoverAudioStream(reason) {
        if (this.multiplayer?.hasLiveEvent || this.liveInput?.active) return;
        const audio = this.audioElement;
        const recovery = this._streamRecovery;
        if (!audio || !recovery || this._disposed) return;
        if (this._audioKind !== 'stream') {
            if (reason === 'error' && this._audioKind === 'file') {
                this.showErrorMessage('This audio file cannot be played. Try an MP3, AAC, OGG or WAV file.');
            }
            return;
        }
        if (recovery.timer) return;
        // A stream that never started (bad URL, CORS, codec) is reported by the
        // rejected play() in _playAudio; only a dropped, previously-playing stream
        // is worth reconnecting.
        if (!recovery.hasPlayed) return;
        const delays = VRClubUI.STREAM_RETRY_DELAYS_MS;
        if (recovery.attempts >= delays.length) {
            // Rather than leave the club silent, the club's own set takes over (never in someone else's room).
            const library = this.musicLibrary;
            const fallback = library && typeof library.fallBackToDefault === 'function' ? library.fallBackToDefault() : Promise.resolve(false);
            fallback.then(started => {
                if (!started) this.showErrorMessage('The stream stopped and could not be reconnected. Choose another station.');
            });
            return;
        }
        const delay = delays[recovery.attempts++];
        // An on-demand episode (finite duration) resumes where it dropped instead of
        // restarting an hour-long set from zero. Captured now: reloading resets it.
        const resumeAt = Number.isFinite(audio.duration) ? audio.currentTime : 0;
        this.showErrorMessage(`Stream interrupted \u2014 reconnecting (attempt ${recovery.attempts} of ${delays.length})\u2026`);
        log.warn(`🎵 Stream ${reason}; reconnect attempt ${recovery.attempts} in ${delay} ms`);
        recovery.timer = setTimeout(() => {
            recovery.timer = null;
            if (this._disposed || this.multiplayer?.hasLiveEvent || this.liveInput?.active || this._audioKind !== 'stream' || !this._audioStreamUrl) return;
            audio.src = this._audioStreamUrl;
            if (resumeAt > 0) {
                audio.addEventListener('loadedmetadata', () => { audio.currentTime = resumeAt; }, { once: true });
            }
            audio.load();
            audio.play().catch(() => this._recoverAudioStream('error'));
        }, delay);
    }

    /**
     * @param {string} src
     * @param {'stream'|'file'} kind
     * @param {string} label
     * @param {{ loop?: boolean, resumeAt?: number }} [options] `loop: false` lets an on-demand episode reach its
     *        end so the caller can queue the next one. `resumeAt` restores a finite saved set after a reload.
     */
    _playAudio(src, kind, label, options = {}) {
        if (this.liveInput?.active) this.liveInput.stop('Input stopped because you chose another music source.');
        this._stopSoundCloudPlayer();
        const audio = this._ensureAudioElement();
        this._stoppedAudioSource = null;
        audio.loop = options.loop !== false;
        this._audioKind = kind;
        this._audioStreamUrl = kind === 'stream' ? src : null;
        if (this._streamRecovery) {
            clearTimeout(this._streamRecovery.timer);
            this._streamRecovery.timer = null;
            this._streamRecovery.attempts = 0;
            this._streamRecovery.hasPlayed = false;
        }
        this._setAudioSrc(src);
        this._connectAudioSourceOnce();
        const resumeAt = Number.isFinite(options.resumeAt) && options.resumeAt > 0 ? options.resumeAt : 0;
        if (resumeAt > 0) {
            const seek = () => {
                if (!Number.isFinite(audio.duration)) return;
                audio.currentTime = Math.min(resumeAt, Math.max(0, audio.duration - 1));
            };
            if (audio.readyState >= 1) seek();
            else audio.addEventListener('loadedmetadata', seek, { once: true });
        }
        audio.load();

        return audio.play().then(() => {
            log.info(`🔊 Playing ${kind}: ${label}`);
            this._shareAudioPosition();
            return audio;
        }).catch(error => {
            // The club's own set starts on its own at entry, before any press: the browser holding that back is expected, the
            // first gesture retries it, and nobody should be told to "press Play again" for music they never asked for.
            if (options.quietBlock && error && error.name === 'NotAllowedError') {
                log.warn(`🔇 Autoplay of ${kind} is waiting for the first gesture.`);
                throw error;
            }
            log.error(`❌ Failed to play ${kind}:`, error);
            this.showErrorMessage('Audio loaded, but playback was blocked. Press Play again.');
            throw error;
        });
    }

    /** @param {{ onDemand?: boolean, resumeAt?: number, quietBlock?: boolean }} [options] an on-demand episode plays once instead of looping; `quietBlock` makes a blocked autoplay silent (it is retried on the first gesture) */
    startAudioStream(url, options = {}) {
        if (this.multiplayer?.hasLiveEvent) return Promise.reject(new Error('The live event DJ controls the music. Leave the event to play your own set.'));
        if (!this._isSafeAudioUrl(url)) {
            log.warn(`🎵 Rejected unsafe audio URL: ${url}`);
            this.showErrorMessage('Invalid audio URL. Use http://, https:// or blob: only.');
            return Promise.reject(new TypeError('Unsafe audio URL'));
        }
        this._localPlaylist = null;
        this.nowPlayingLabel = url; // a podcast episode replaces this with its title once it has started
        if (typeof this.syncDJFromSet === 'function') this.syncDJFromSet({ label: url, url });
        return this._playAudio(url, 'stream', url, { loop: !options.onDemand, resumeAt: options.resumeAt, quietBlock: options.quietBlock });
    }

    static _loadSoundCloudAPI() {
        if (window.SC && typeof window.SC.Widget === 'function') return Promise.resolve(window.SC);
        if (VRClubUI._soundCloudAPIReady) return VRClubUI._soundCloudAPIReady;
        const pending = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            const fail = () => {
                clearTimeout(timer);
                script.remove();
                reject(new Error('SoundCloud playback tracking could not load. Try playing the set again.'));
            };
            const timer = setTimeout(fail, 10000);
            script.src = 'https://w.soundcloud.com/player/api.js';
            script.onload = () => {
                if (!window.SC || typeof window.SC.Widget !== 'function') return fail();
                clearTimeout(timer);
                resolve(window.SC);
            };
            script.onerror = fail;
            document.head.appendChild(script);
        });
        VRClubUI._soundCloudAPIReady = pending;
        pending.catch(() => {
            if (VRClubUI._soundCloudAPIReady === pending) VRClubUI._soundCloudAPIReady = null;
        });
        return pending;
    }

    async startSoundCloud(url, label = 'SoundCloud set') {
        if (this.multiplayer?.hasLiveEvent) throw new Error('The live event DJ controls the music. Leave the event to play your own set.');
        if (this.liveInput?.active) this.liveInput.stop('Input stopped because you chose another music source.');
        const parsed = new URL(String(url));
        if (parsed.protocol !== 'https:' || !/(^|\.)soundcloud\.com$/.test(parsed.hostname) ||
            parsed.username || parsed.password) {
            return Promise.reject(new TypeError('Use a SoundCloud track or set page URL.'));
        }
        this._localPlaylist = null;
        if (this.audioElement) this.audioElement.pause();
        this._stopSoundCloudPlayer();
        const holder = document.getElementById('soundCloudPlayer');
        if (!holder) return Promise.reject(new Error('The SoundCloud player is unavailable.'));
        const iframe = document.createElement('iframe');
        iframe.title = `SoundCloud player: ${label}`;
        iframe.allow = 'autoplay; encrypted-media';
        iframe.referrerPolicy = 'no-referrer';
        iframe.src = `https://w.soundcloud.com/player/?url=${encodeURIComponent(parsed.href)}&auto_play=true&hide_related=true&show_comments=false&show_reposts=false&visual=false`;
        holder.appendChild(iframe);
        holder.hidden = false;
        this._soundCloudFrame = iframe;
        this._soundCloudUrl = parsed.href;
        this._audioKind = 'soundcloud';
        this._audioStreamUrl = null;
        this._soundCloudPlaying = false;
        this._soundCloudDanceBeat = 0;
        this._soundCloudStateRevision = 0;
        try {
            const SC = await VRClubUI._loadSoundCloudAPI();
            if (this._soundCloudFrame !== iframe) return iframe;
            const widget = SC.Widget(iframe);
            this._soundCloudWidget = widget;
            const events = SC.Widget.Events;
            this._soundCloudEvents = [events.READY, events.PLAY, events.PLAY_PROGRESS, events.PAUSE, events.FINISH, events.ERROR];
            const current = () => this._soundCloudFrame === iframe && this._soundCloudWidget === widget;
            const playing = value => {
                if (!current()) return;
                this._soundCloudStateRevision++;
                this._setSoundCloudPlaying(value);
            };
            widget.bind(events.PLAY, () => playing(true));
            widget.bind(events.PLAY_PROGRESS, () => playing(true));
            widget.bind(events.PAUSE, () => playing(false));
            widget.bind(events.FINISH, () => playing(false));
            widget.bind(events.ERROR, () => {
                if (!current()) return;
                playing(false);
                log.warn('SoundCloud reported a playback error.');
                this.showErrorMessage('SoundCloud could not play this set. Check its official player in Music.');
            });
            widget.bind(events.READY, () => {
                const revision = this._soundCloudStateRevision;
                widget.isPaused(paused => {
                    if (current() && revision === this._soundCloudStateRevision) playing(paused === false);
                });
            });
        } catch (error) {
            if (this._soundCloudFrame === iframe) {
                log.error('SoundCloud playback tracking failed:', error);
                this.showErrorMessage(error.message);
                throw error;
            }
        }
        return iframe;
    }

    _setSoundCloudPlaying(playing) {
        if (this._soundCloudPlaying === playing) return;
        const now = performance.now();
        if (playing) this._soundCloudDanceStartedAt = now;
        else this._soundCloudDanceBeat += Math.max(0, now - this._soundCloudDanceStartedAt) / 500;
        this._soundCloudPlaying = playing;
    }

    _stopSoundCloudPlayer() {
        if (this._soundCloudWidget) {
            for (const event of this._soundCloudEvents) this._soundCloudWidget.unbind(event);
            this._soundCloudWidget = null;
            this._soundCloudEvents = null;
        }
        this._soundCloudPlaying = false;
        this._soundCloudDanceBeat = 0;
        this._soundCloudDanceStartedAt = 0;
        if (this._soundCloudFrame) {
            this._soundCloudFrame.remove();
            this._soundCloudFrame = null;
        }
        const holder = typeof document !== 'undefined' && document.getElementById('soundCloudPlayer');
        if (holder) {
            holder.replaceChildren();
            holder.hidden = true;
        }
        this._soundCloudUrl = null;
    }

    startAudioFromFile(file, options = {}) {
        if (this.multiplayer?.hasLiveEvent) return Promise.reject(new Error('The live event DJ controls the music. Leave the event to play your own set.'));
        if (!VRClubUI.isLocalAudioFile(file)) {
            return Promise.reject(new TypeError('Choose an MP3, M4A, OGG, FLAC, WAV, AAC, Opus or WebM audio file.'));
        }
        if (!options.fromPlaylist) this._localPlaylist = null;
        log.info(`🎵 Loading audio file: ${file.name}`);
        const fileUrl = URL.createObjectURL(file);
        this.nowPlayingLabel = file.name;
        if (typeof this.syncDJFromSet === 'function') this.syncDJFromSet({ label: file.name });
        return this._playAudio(fileUrl, 'file', file.name, { loop: !options.fromPlaylist });
    }

    /**
     * Play audio files selected through a folder picker. Browser File objects cannot be persisted safely, so the
     * playlist lasts for this page session; links in MusicLibrary remain the persistent source list.
     */
    async startAudioFolder(fileList, options = {}) {
        if (!this.guardHostControl('music')) return false;
        const files = Array.from(fileList || []).filter(VRClubUI.isLocalAudioFile);
        if (!files.length) throw new Error('That folder contains no supported audio files.');
        files.sort((a, b) => String(a.webkitRelativePath || a.name).localeCompare(
            String(b.webkitRelativePath || b.name), undefined, { numeric: true, sensitivity: 'base' }
        ));
        this._localPlaylist = {
            files,
            order: files.map((_, index) => index),
            position: 0,
            shuffle: !!options.shuffle
        };
        this._localPlaylistShuffle = !!options.shuffle;
        if (options.shuffle) {
            for (let i = this._localPlaylist.order.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [this._localPlaylist.order[i], this._localPlaylist.order[j]] =
                    [this._localPlaylist.order[j], this._localPlaylist.order[i]];
            }
        }
        return this._playLocalPlaylistPosition(0);
    }

    setLocalPlaylistShuffle(shuffle) {
        const playlist = this._localPlaylist;
        if (!playlist) {
            this._localPlaylistShuffle = !!shuffle;
            return false;
        }
        const current = playlist.order[playlist.position] ?? 0;
        const rest = playlist.files.map((_, index) => index).filter(index => index !== current);
        if (shuffle) {
            for (let i = rest.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [rest[i], rest[j]] = [rest[j], rest[i]];
            }
        }
        playlist.shuffle = !!shuffle;
        playlist.order = shuffle
            ? [current, ...rest]
            : playlist.files.map((_, index) => index);
        playlist.position = shuffle ? 0 : current;
        return true;
    }

    async _playLocalPlaylistPosition(position) {
        const playlist = this._localPlaylist;
        if (!playlist || !playlist.files.length) throw new Error('No local folder is loaded.');
        playlist.position = (position + playlist.order.length) % playlist.order.length;
        const file = playlist.files[playlist.order[playlist.position]];
        await this.startAudioFromFile(file, { fromPlaylist: true });
        const audio = this.audioElement;
        if (audio && !this._onLocalPlaylistEnded) {
            this._onLocalPlaylistEnded = () => {
                if (!this._localPlaylist || this._audioKind !== 'file') return;
                this._playLocalPlaylistPosition(this._localPlaylist.position + 1)
                    .catch(error => this.showErrorMessage(`Could not play the next folder track: ${error.message}`));
            };
            audio.addEventListener('ended', this._onLocalPlaylistEnded);
        }
        return file;
    }

    /** Previous/next means a track in the active folder, otherwise the previous/next saved URL source. */
    async stepAudioSource(delta) {
        if (!this.guardHostControl('music')) return false;
        if (delta !== -1 && delta !== 1) throw new Error('Choose the previous or next source.');
        if (this._localPlaylist) return this._playLocalPlaylistPosition(this._localPlaylist.position + delta);
        if (!this.musicLibrary) throw new Error('The music player is not ready yet.');
        this.musicLibrary.step(delta);
        return this.musicLibrary.play();
    }

    // =========================================================================
    // PLAYBACK POSITION
    //
    // Shared by the desktop Audio menu's slider and the VR menu's seek bar: both read getPlaybackInfo() and
    // write through seekAudioTo(), so a seek means the same thing on either surface (including telling the
    // room when this guest is its host).
    // =========================================================================

    /**
     * Where the music is. `seekable` is false for a live stream (its duration is Infinity) and when nothing is loaded.
     * @returns {{ seekable: boolean, position: number, duration: number, playing: boolean }}
     */
    getPlaybackInfo() {
        if (this._audioKind === 'network') {
            return { seekable: false, position: 0, duration: 0, playing: !!this.liveInput?.stream || !!this.multiplayer?._eventAudio || !!this.multiplayer?._broadcastState?.playing };
        }
        if (this._audioKind === 'soundcloud') {
            return { seekable: false, position: 0, duration: 0, playing: !!this._soundCloudPlaying };
        }
        const audio = this.audioElement;
        if (!audio) return { seekable: false, position: 0, duration: 0, playing: false };
        const duration = audio.duration;
        const seekable = Number.isFinite(duration) && duration > 0 && !!audio.seekable && audio.seekable.length > 0;
        return {
            seekable,
            position: Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
            duration: seekable ? duration : 0,
            playing: !audio.paused && !audio.ended
        };
    }

    /** Jump to `seconds` (clamped to the audio). Returns false when there is nothing to seek in. */
    seekAudioTo(seconds) {
        if (!this.guardHostControl('music')) return false;
        const info = this.getPlaybackInfo();
        if (!info.seekable || !Number.isFinite(seconds)) return false;
        // Stay just inside the end: seeking to the very end fires 'ended' and starts the next episode.
        this.audioElement.currentTime = Math.min(Math.max(0, seconds), Math.max(0, info.duration - 1));
        this._shareAudioPosition();
        return true;
    }

    /** Jump to a fraction (0..1) of the audio's length. */
    seekAudioFraction(fraction) {
        const info = this.getPlaybackInfo();
        return info.seekable && Number.isFinite(fraction) ? this.seekAudioTo(Math.min(1, Math.max(0, fraction)) * info.duration) : false;
    }

    /** Go forward (positive) or back (negative) by `delta` seconds. */
    seekAudioBy(delta) {
        const info = this.getPlaybackInfo();
        return info.seekable ? this.seekAudioTo(info.position + delta) : false;
    }

    /** Explicit play/pause used by the VR transport and the desktop panel. */
    setAudioPlayback(playing) {
        if (this.liveInput?.active) {
            this.showErrorMessage('Your mixer controls the music. Use Live input to stop testing or broadcasting.');
            return false;
        }
        if (!this.guardHostControl('music')) return false;
        if (this._audioKind === 'soundcloud') {
            this.showErrorMessage('Use the official SoundCloud player in Music to play or pause this set.');
            return false;
        }
        const audio = this.audioElement;
        if (playing && audio && !audio.src && this._stoppedAudioSource) {
            this._setAudioSrc(this._stoppedAudioSource.src);
            audio.load();
            this._stoppedAudioSource = null;
        }
        if (!audio || !audio.src) {
            this.showErrorMessage('No music yet. Open Music and add your own audio link or file.');
            return false;
        }
        if (playing && audio.paused) {
            if (this.audioContext && this.audioContext.state === 'suspended') this.audioContext.resume().catch(() => {});
            audio.play().catch(() => this.showErrorMessage('Playback was blocked. Press Play again.'));
        } else if (!playing && !audio.paused) {
            audio.pause();
        }
        this._shareAudioPosition(!!playing);
        return !audio.paused;
    }

    /** Play or pause what is loaded. Returns true when it is now playing. */
    toggleAudioPlayback() {
        if (!this.guardHostControl('music')) return false;
        const audio = this.audioElement;
        return this.setAudioPlayback(!!audio?.paused);
    }

    /** Stop finite media at its beginning; disconnect a live stream so it no longer downloads until Play is pressed. */
    stopAudioPlayback() {
        if (this.liveInput?.active) { this.liveInput.stop(); return true; }
        if (!this.guardHostControl('music')) return false;
        if (this._audioKind === 'soundcloud') {
            if (this._soundCloudWidget) {
                this._soundCloudWidget.pause();
                this._soundCloudWidget.seekTo(0);
                return true;
            }
            return false;
        }
        const audio = this.audioElement;
        if (!audio || !audio.src) {
            this.showErrorMessage('No music is loaded.');
            return false;
        }
        audio.pause();
        if (Number.isFinite(audio.duration)) {
            try { audio.currentTime = 0; } catch (_) { /* media metadata may still be loading */ }
        } else if (this._audioKind === 'stream' && this._audioStreamUrl) {
            this._stoppedAudioSource = { src: this._audioStreamUrl };
            audio.removeAttribute('src');
            audio.load();
        }
        this._shareAudioPosition(false);
        return true;
    }

    /** The room's host publishes the position after a seek or a pause, so listeners follow (guests cannot publish). */
    _shareAudioPosition(playing) {
        const net = this.networkManager;
        const audio = this.audioElement;
        if (this.multiplayer) this.multiplayer.shareLocalMusic();
        if (!net || !net.connected || !net.isHost() || !audio || this._audioKind !== 'stream' || !this._audioStreamUrl) return;
        net.sendMusic({
            url: this._audioStreamUrl,
            playing: playing === undefined ? !audio.paused : playing,
            position: audio.currentTime
        });
    }

    /**
     * Is this message a failure or a notice? Failures (could not, cannot, failed, unavailable, blocked playback, ...) are the red
     * assertive alerts; everything else ("Standing up", "Joining...", "Your character: woman") is a calm, polite status. Pure, so
     * the wording that drives it is tested; a caller can always say which with the second argument of showErrorMessage().
     */
    static toastKind(message) {
        return /\b(could not|couldn't|cannot|can't|failed|unavailable|not available|not ready|was blocked|were blocked|interrupted|invalid|context lost|stopped and|error|needs an update|denied|not supported)\b/i
            .test(String(message || '')) ? 'error' : 'info';
    }

    /**
     * Show a message. The method keeps its old name (a hundred callers, and tests stub it) but is the one toast: failures appear
     * red in an assertive live region, notices appear calm, low on the screen, in a polite one, so a screen reader is not
     * interrupted by "Standing up". `kind` ('error' | 'info') overrides the wording.
     */
    showErrorMessage(message, kind) {
        // QC fixes vs. the previous implementation:
        //  - `document.body.removeChild(el)` threw NotFoundError if the node had
        //    already been removed (e.g. two messages fired inside 3 s).
        //  - Concurrent messages stacked at the exact same fixed position, so only
        //    the last one was legible.
        //  - The toast was invisible to assistive technology.
        const isError = (kind || VRClubUI.toastKind(message)) === 'error';
        const hostKey = isError ? '_toastHost' : '_statusHost';
        if (!this[hostKey]) {
            const host = document.createElement('div');
            host.id = isError ? 'vrclubToasts' : 'vrclubStatus';
            host.setAttribute('role', isError ? 'alert' : 'status');
            host.setAttribute('aria-live', isError ? 'assertive' : 'polite');
            host.style.cssText = [
                'position:fixed', isError ? 'top:50%' : 'bottom:96px', 'left:50%',
                isError ? 'transform:translate(-50%,-50%)' : 'transform:translateX(-50%)',
                'z-index:10000', 'display:flex', 'flex-direction:column', 'gap:8px',
                'align-items:center', 'pointer-events:none', 'max-width:90vw'
            ].join(';');
            document.body.appendChild(host);
            this[hostKey] = host;
        }

        const toast = document.createElement('div');
        toast.style.cssText = (isError ? [
            'background:rgba(200,0,0,0.92)', 'color:#fff', 'padding:16px 28px',
            'border-radius:10px', 'font-size:17px', 'font-weight:700',
            'text-align:center', 'box-shadow:0 8px 24px rgba(0,0,0,0.5)'
        ] : [
            'background:rgba(16,22,32,0.92)', 'color:#e8fffb', 'padding:10px 20px',
            'border:1px solid rgba(143,255,238,0.45)', 'border-radius:999px', 'font-size:15px', 'font-weight:600',
            'text-align:center', 'box-shadow:0 6px 18px rgba(0,0,0,0.45)'
        ]).join(';');
        toast.textContent = message; // textContent, never innerHTML — message may echo user input
        this[hostKey].appendChild(toast);

        setTimeout(() => toast.remove(), isError ? 4000 : 3000);
    }

    /**
     * Automatic quality: while on, a tier that keeps missing the frame budget is lowered for this session (never raised,
     * never saved). Personal and local, like Safe Mode.
     */
    setAutoQuality(enabled) {
        this.autoQuality = !!enabled;
        try { localStorage.setItem('vrclub.autoQuality', this.autoQuality ? '1' : '0'); } catch (_) { /* private mode */ }
        if (this._autoQuality) this._autoQuality.pause(performance.now() / 1000);
        if (this._frameStats) this._frameStats.reset();
        this.showErrorMessage(this.autoQuality ? 'Auto quality on: graphics step down if frames are missed' : 'Auto quality off');
        this._refreshVRQuickMenu();
        const button = typeof document !== 'undefined' ? document.getElementById('vjAutoQualityBtn') : null;
        if (button) { button.setAttribute('aria-pressed', String(this.autoQuality)); button.classList.toggle('active', this.autoQuality); }
        return this.autoQuality;
    }

    /**
     * Seated mode: the player sits, the avatar stands. The view is lifted to the body's standing eye height (see
     * `PlayerHeight.SeatedLift`, applied through `_xrHeadHeight()`), so others see a standing person at their height.
     * Personal and local, never host-gated.
     */
    setSeatedMode(enabled) {
        this.vrSeatedMode = !!enabled;
        try { localStorage.setItem('vrclub.seatedMode', this.vrSeatedMode ? '1' : '0'); } catch (_) { /* private mode */ }
        // A sitter's low head must not feed the standing-height estimate, and it re-learns once they stand.
        if (this._heightEstimator) this._heightEstimator.reset();
        this.showErrorMessage(this.vrSeatedMode
            ? 'Seated mode on: you sit, your avatar stands'
            : 'Seated mode off: your avatar follows your real height');
        this._refreshVRQuickMenu();
        return this.vrSeatedMode;
    }

    setVRComfortMode(enabled) {
        this._closeVRSocialWheel(true);
        this.vrComfortMode = !!enabled;
        try { localStorage.setItem('vrclub.vrComfort', this.vrComfortMode ? '1' : '0'); } catch (_) {}
        this._applyXRLocomotionMode();
        const xrCamera = this.vrHelper?.baseExperience?.camera;
        // Never camera gravity in the headset: its collision ellipsoid hangs from the EYE, so gravity sank the eye
        // to 0.8 m and fought the walking-surface follow every frame (no stair could be climbed). The follow
        // (_updateVRWalkSurface) owns the headset's height on the floor, the stair, the balcony and the DJ riser.
        if (xrCamera) xrCamera.applyGravity = false;
        if (xrCamera && this.vrComfortMode) {
            xrCamera.cameraDirection?.set(0, 0, 0);
            xrCamera.cameraRotation?.set(0, 0);
        }
        if (this.vrComfortMode && this.jumpState) this.jumpState.active = false;
        if (typeof document !== 'undefined') {
            const splashState = document.getElementById('splashVRComfortState');
            const splashBtn = document.getElementById('splashVRComfortBtn');
            if (splashBtn) splashBtn.setAttribute('aria-pressed', String(this.vrComfortMode));
            if (splashState) splashState.textContent = this.vrComfortMode ? 'ON' : 'OFF';
            const button = document.getElementById('vjVRComfortBtn');
            if (button) {
                button.setAttribute('aria-pressed', String(this.vrComfortMode));
                button.classList.toggle('active', this.vrComfortMode);
            }
        }
        this._refreshVRQuickMenu();
        return this.vrComfortMode;
    }

    /** Surfaces the VR teleport arc may land on: the club floor, the balcony deck and stair, the entrance's floors and stair, the restroom floor, and the street. */
    _teleportFloorMeshes() {
        return [this.floorMesh, this._mezzDeck, this._vestibuleFloor, this._vestibuleStair, this._restroomFloor, ...(this._cityGround || [])].filter(Boolean);
    }

    _teleportBlockerMeshes() {
        const floors = this._teleportFloorMeshes();
        const blockers = this.scene.meshes.filter(mesh => mesh.checkCollisions && mesh.isEnabled() && !floors.includes(mesh));
        // Keep this safety-critical barrier explicit. It is normally covered by the
        // generic collision sweep, but must remain a teleport blocker if the wall's
        // render mesh or collision flags are changed independently.
        if (this._ledWallCollider && this._ledWallCollider.isEnabled() &&
            !floors.includes(this._ledWallCollider) && !blockers.includes(this._ledWallCollider)) {
            blockers.push(this._ledWallCollider);
        }
        return blockers;
    }

    _xrMovementOptions() {
        const registrations = BABYLON.WebXRControllerMovement.REGISTRATIONS.default.map(registration => {
            const forceHandedness = registration.forceHandedness === 'left' ? 'right' : 'left';
            if (forceHandedness !== 'right') return { ...registration, forceHandedness };
            return {
                ...registration,
                forceHandedness,
                axisChangedHandler: (axes, movementState, featureContext) => {
                    if (this._vrSocialWheel?.open) {
                        movementState.rotateX = 0;
                        movementState.rotateY = 0;
                        return;
                    }
                    registration.axisChangedHandler(axes, movementState, featureContext);
                }
            };
        });
        return {
            xrInput: this.vrHelper.input,
            movementEnabled: true,
            movementSpeed: 1.5,
            movementThreshold: 0.2,
            rotationEnabled: true,
            rotationSpeed: 0.8,
            rotationThreshold: 0.2,
            movementOrientationFollowsViewerPose: true,
            movementOrientationFollowsController: false,
            // Reuse Babylon's dead-zone handlers, swapping its default right-walk/left-turn layout.
            customRegistrationConfigurations: registrations
        };
    }

    /**
     * Babylon declares MOVEMENT and TELEPORTATION mutually exclusive: enabling one
     * while the other is enabled throws. Comfort mode therefore swaps features rather
     * than toggling flags on both. The swap only happens in-session, because the
     * movement feature needs live XR input; outside XR teleportation stays registered
     * (the default experience created it) and the IN_XR handler re-applies the mode.
     */
    _applyXRLocomotionMode() {
        const vrHelper = this.vrHelper;
        const experience = vrHelper && vrHelper.baseExperience;
        const features = experience && experience.featuresManager;
        const names = typeof BABYLON !== 'undefined' ? BABYLON.WebXRFeatureName : null;
        if (!features || !names) return;

        const inXR = experience.state === BABYLON.WebXRState.IN_XR;
        try {
            if (this.vrComfortMode) {
                if (features.getEnabledFeature(names.MOVEMENT)) features.disableFeature(names.MOVEMENT);
                this.movementFeature = null;
                let teleport = features.getEnabledFeature(names.TELEPORTATION);
                if (!teleport) {
                    teleport = features.enableFeature(names.TELEPORTATION, 'latest', {
                        xrInput: vrHelper.input,
                        floorMeshes: this._teleportFloorMeshes()
                    });
                    if (vrHelper.pointerSelection && teleport.setSelectionFeature) {
                        teleport.setSelectionFeature(vrHelper.pointerSelection);
                    }
                }
                // The default experience registered only the main floor. The balcony deck and its stair are
                // floors too; remove-then-add keeps re-application idempotent.
                if (typeof teleport.addFloorMesh === 'function') {
                    for (const mesh of this._teleportFloorMeshes()) {
                        if (typeof teleport.removeFloorMesh === 'function') teleport.removeFloorMesh(mesh);
                        teleport.addFloorMesh(mesh);
                    }
                }
                vrHelper.teleportation = teleport;
                teleport.teleportationEnabled = true;
                teleport.rotationEnabled = true;
                teleport.rotationAngle = Math.PI / 6;
                teleport.backwardsMovementEnabled = false;
                // Use the same geometry as walking, excluding walkable floors. This includes
                // the vestibule, bar, rails and equipment added after the original room.
                if (typeof teleport.addBlockerMesh === 'function' && this.scene) {
                    for (const mesh of this._xrTeleportBlockers || []) teleport.removeBlockerMesh(mesh);
                    this._xrTeleportBlockers = this._teleportBlockerMeshes();
                    for (const mesh of this._xrTeleportBlockers) {
                        teleport.removeBlockerMesh(mesh);
                        teleport.addBlockerMesh(mesh);
                    }
                }
            } else if (inXR) {
                if (features.getEnabledFeature(names.TELEPORTATION)) features.disableFeature(names.TELEPORTATION);
                vrHelper.teleportation = null;
                this.movementFeature = features.getEnabledFeature(names.MOVEMENT)
                    || features.enableFeature(names.MOVEMENT, 'latest', this._xrMovementOptions());
                this.movementFeature.movementEnabled = true;
                this.movementFeature.rotationEnabled = true;
                this.movementFeature.movementSpeed = 1.5;
            } else if (vrHelper.teleportation) {
                vrHelper.teleportation.teleportationEnabled = false;
                vrHelper.teleportation.rotationEnabled = false;
            }
        } catch (error) {
            const message = error && error.message ? error.message : String(error);
            log.error('Could not apply VR locomotion mode:', message);
            if (typeof this.recordDiagnostic === 'function') {
                this.recordDiagnostic('xr', 'VR locomotion mode failed', { error: message });
            }
        }
    }

    moveCameraToPreset(preset) {
        // The club is a basement: the street and the top of the entrance stair are at street level.
        const street = (window.VenueLayout && window.VenueLayout.vestibule.streetLevel) || 0;
        const presets = {
            // At the top of the entrance stair (the street-level landing), looking down it into the club.
            arrival: { label: 'Arrival', pos: new BABYLON.Vector3(0, street + 1.7, 5.5), target: new BABYLON.Vector3(0, 1.2, -12), level: street },
            danceFloor: { label: 'Dance Floor', pos: new BABYLON.Vector3(-2.8, 1.7, -9.2), target: new BABYLON.Vector3(0, 2.6, -18.5) },
            // Eye height for someone standing on the 0.5 m riser, inside the 1 m
            // gap between the LED wall (z=-20) and the deck plinth (z=-19), facing out.
            djBooth: { label: 'DJ Booth', pos: new BABYLON.Vector3(0, 2.2, -19.4), target: new BABYLON.Vector3(0, 1.7, -10), level: 0.5 },
            lightingGallery: { label: 'Lighting Gallery', pos: new BABYLON.Vector3(10, 5.2, -6.5), target: new BABYLON.Vector3(0, 2.4, -15.5) },
            // Standing on the steel mezzanine (deck at y 3), looking across the dance floor to the booth.
            balcony: { label: 'Balcony', pos: new BABYLON.Vector3(-10.9, 4.7, -12.4), target: new BABYLON.Vector3(1, 2.7, -16), level: 3.0 },
            // On the pavement outside the street door, looking across the avenue at the far row of buildings.
            street: { label: 'Street', pos: new BABYLON.Vector3(0, street + 1.7, 8.2), target: new BABYLON.Vector3(0, street + 8, 30), level: street }
        };
        
        const p = presets[preset];
        if (preset === 'street' && !(this._streetDoor && this._streetDoor.open)) {
            this.showErrorMessage('The street is not available yet.', 'info');
            return;
        }
        if (p) {
            const xrCamera = this.isInVRMode ? this.vrHelper?.baseExperience?.camera : null;
            if (xrCamera) {
                const height = this._xrHeadHeight();
                if (!Number.isFinite(height)) {
                    this.showErrorMessage('Head tracking is not ready. Please try the destination again.');
                    return;
                }
                xrCamera.position.x = p.pos.x;
                xrCamera.position.z = p.pos.z;
                xrCamera.position.y = height + (preset === 'djBooth' ? 0.5 : (p.level || 0));
                if (xrCamera._deferOnly && xrCamera._deferredUpdated) xrCamera._deferredPositionUpdate.copyFrom(xrCamera.position);
                if (this.jumpState) this.jumpState.active = false;
            } else {
                this.camera.position.copyFrom(p.pos);
                this.camera.setTarget(p.target);
            }
            this._walkLevel = p.level || 0;
            this._vrFallSpeed = 0;
            this.showCameraTransitionFeedback(p.label);
        }
    }

    showCameraTransitionFeedback(label) {
        const feedback = document.createElement('div');
        feedback.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(0, 255, 200, 0.9);
            color: black;
            padding: 20px 40px;
            border-radius: 10px;
            font-size: 24px;
            font-weight: bold;
            z-index: 10000;
            animation: fadeOut 1.5s forwards;
        `;
        feedback.textContent = `📷 ${label.toUpperCase()}`;
        document.body.appendChild(feedback);
        
        setTimeout(() => feedback.remove(), 1500);
    }
}
window.VRClubUI = VRClubUI;
