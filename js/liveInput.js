'use strict';

class LiveInput {
    constructor(club, onChange = () => {}) {
        this.club = club;
        this.onChange = onChange;
        this.stream = null;
        this.publisher = null;
        this.remote = null;
        this.busy = false;
        this.goingLive = false;
        this.live = false;
        this.monitoring = false;
        this.performAsDJ = true;
        this.status = 'Connect your mixer, then test it here. Nothing is sent to guests.';
        this.format = '';
        this.levels = [0, 0];
        this.revision = 0;
        this.eventId = null;
        this._onPageHide = () => this.stop();
        window.addEventListener('pagehide', this._onPageHide);
        this._unsubscribe = club.multiplayer.onChange(() => this._roomChanged());
    }

    static constraints(deviceId = '') {
        return { audio: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
            channelCount: { ideal: 2 }, sampleRate: { ideal: 48000 },
            echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false };
    }

    static inputError(error) {
        if (error.name === 'NotAllowedError') return 'Audio permission was not allowed. Allow microphone access in your browser, then try again. No camera is used.';
        if (error.name === 'NotFoundError') return 'No audio input was found. Connect your mixer or audio interface, then try again.';
        if (error.name === 'NotReadableError') return 'That input is busy or unavailable. Check its cable and whether another app has exclusive access.';
        if (error.name === 'OverconstrainedError') return 'That input is no longer available. Choose another input and test again.';
        return error.message || 'The audio input could not start.';
    }

    get active() { return this.busy || !!this.stream; }

    get canTest() {
        const mp = this.club.multiplayer;
        return mp.hasLiveEvent ? !!mp.liveEvent.canManage && !mp.liveEvent.live : !this.club.isFollowingHost();
    }

    retainsInputFor(event) {
        return !!(this.stream && event?.canManage && !event.ended &&
            (this.goingLive || this.eventId === event.id));
    }

    _changed() { this.onChange(this); }

    async start(deviceId = '') {
        if (this.active) throw new Error('Stop the current test before choosing another input.');
        if (!this.canTest) throw new Error('Leave the current event or host before testing your own input.');
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Audio input needs HTTPS or localhost and a browser with microphone support.');
        const revision = ++this.revision;
        this.busy = true;
        this.status = 'Allow audio access when your browser asks. Nothing is being broadcast.';
        this._changed();
        try {
            this.club._ensureAudioContext();
            await this.club.audioContext.resume();
            if (revision !== this.revision) return;
            const stream = await navigator.mediaDevices.getUserMedia(LiveInput.constraints(deviceId));
            if (revision !== this.revision) {
                for (const track of stream.getTracks()) track.stop();
                return;
            }
            this.stream = stream;
            if (!this.canTest) throw new Error('The room changed while permission was open. Leave it before testing your input.');
            if (this.club.multiplayer.hasLiveEvent) this.eventId = this.club.multiplayer.liveEvent.id;
            const track = stream.getAudioTracks()[0];
            if (!track) throw new Error('The selected input returned no audio.');
            track.contentHint = 'music';
            track.addEventListener('ended', () => {
                this.stop('Input disconnected. Check its cable, then test again.');
            }, { once: true });
            if (this.club._streamRecovery) {
                clearTimeout(this.club._streamRecovery.timer);
                this.club._streamRecovery.timer = null;
                this.club._streamRecovery.hasPlayed = false;
            }
            const mp = this.club.multiplayer;
            mp._stopMusicBroadcast();
            if (mp.client?.musicStream) mp.client.setLocalMusic(null, { playing: false });
            this.remote = this.club.startNetworkMusic(stream, { playing: true, title: 'Mixer input - local test', localInput: true });
            const settings = track.getSettings();
            this.format = settings.channelCount === 1 ? 'Mono input. Choose a stereo mixer output if available.'
                : settings.channelCount === 2 ? 'Stereo input connected.' : 'Input connected; this browser does not report whether it is stereo.';
            if (settings.echoCancellation || settings.noiseSuppression || settings.autoGainControl) {
                this.format += ' Your browser still has voice processing on; this can change how music sounds.';
            }
            this._startMeters(settings.channelCount);
            if (this.performAsDJ) this.club.setPerformingAsDJ?.(true, { moveCamera: true });
            this.status = 'Only you - the crowd and lights follow your input. Guests cannot hear this test.';
        } catch (error) {
            if (revision === this.revision) this.stop(LiveInput.inputError(error));
            throw error;
        } finally {
            if (revision === this.revision) { this.busy = false; this._changed(); }
        }
    }

    _startMeters(channelCount) {
        const context = this.club.audioContext;
        this.splitter = context.createChannelSplitter(2);
        this.remote.source.connect(this.splitter);
        this.analysers = [context.createAnalyser(), context.createAnalyser()];
        const buffers = this.analysers.map(analyser => { analyser.fftSize = 512; return new Float32Array(512); });
        this.analysers.forEach((analyser, index) => this.splitter.connect(analyser, index));
        this._meter = setInterval(() => {
            let clipping = false;
            this.analysers.forEach((analyser, index) => {
                analyser.getFloatTimeDomainData(buffers[index]);
                let peak = 0;
                for (const value of buffers[index]) peak = Math.max(peak, Math.abs(value));
                this.levels[index] = Math.min(1, peak);
                clipping ||= peak >= 0.995;
            });
            this.signal = clipping ? 'Too loud - lower the mixer output.'
                : Math.max(...this.levels) > 0.001 ? channelCount === 1
                    ? 'Audio detected from your mono input.'
                    : 'Audio detected. Both bars should move for a stereo set.'
                    : 'No sound yet. Play music and check the mixer output and chosen input.';
            this._changed();
        }, 150);
    }

    setMonitoring(on) {
        this.monitoring = !!on && !!this.remote;
        if (this.remote) this.remote.monitor.gain.setTargetAtTime(this.monitoring ? (this.club._audioVolume ?? 1) : 0, this.club.audioContext.currentTime, 0.025);
        this._changed();
    }

    setPerformAsDJ(on) {
        this.performAsDJ = !!on;
        this.club.setPerformingAsDJ?.(this.performAsDJ && !!this.stream, { moveCamera: this.performAsDJ });
        this._changed();
    }

    async _joinPrivateRoom() {
        const mp = this.club.multiplayer;
        if (mp.connected) return;
        if (mp.connecting) throw new Error('A session is already connecting. Wait for it to finish, then press Go live.');
        if (!mp.hasAcceptedOnlineSafety()) {
            const error = new Error('Before going live, read the Online safety guide. Then return here and press Go live.');
            error.code = 'online-safety';
            throw error;
        }
        if (!mp.joinNewPrivateRoom()) throw new Error(mp.lastError || 'Could not start your private session.');
        if (mp.connected) return;
        await new Promise((resolve, reject) => {
            const finish = error => {
                clearTimeout(timer);
                unsubscribe();
                this._cancelJoin = null;
                if (error) reject(error); else resolve();
            };
            const unsubscribe = mp.onChange(() => {
                if (mp.connected) finish();
                else if (!mp.connecting && mp.lastError) finish(new Error(mp.lastError));
            });
            const timer = setTimeout(() => finish(new Error('The session could not connect. Check your internet connection and try again.')), 20000);
            this._cancelJoin = () => finish(new Error('Live setup cancelled.'));
        });
    }

    async goLive(title = 'Live DJ set') {
        if (!this.stream || this.busy || this.goingLive || this.publisher) throw new Error('Test your input first, or stop the current broadcast before starting another.');
        const revision = this.revision, mp = this.club.multiplayer;
        this.goingLive = true;
        this.status = 'Preparing your private live session. Your test is still private.';
        this._changed();
        try {
            await this._joinPrivateRoom();
            if (revision !== this.revision) return;
            if (!mp.isHost() && !mp.liveEvent?.canManage) throw new Error('Only the session host can start a live set.');
            if (!mp.client.liveEventsSupported) throw new Error('This server does not support live sets. Use the default club server.');
            if (!mp.hasLiveEvent) await mp.manageLiveEvent('create', title.trim() || 'Live DJ set');
            if (revision !== this.revision) return;
            if (!mp.hasLiveEvent || !mp.liveEvent.canManage) throw new Error('The live session was not confirmed. Please try again.');
            if (mp.liveEvent.live) throw new Error('Another DJ is already broadcasting. Stop that broadcast before using this input.');
            const invitation = new URL(mp.publisherInviteUrl());
            this.eventId = mp.liveEvent.id;
            const publisher = new window.LiveAudioClient({
                serverUrl: mp.client.serverUrl, eventId: this.eventId,
                token: decodeURIComponent(invitation.hash.slice(1)), role: 'publisher',
                onState: state => {
                    if (this.publisher !== publisher) return;
                    if (state.ended) this.stopBroadcast('The live session ended. Your input is now only a local test.');
                    else if (state.connection === 'reconnecting') {
                        this.live = false;
                        this.status = 'Broadcast interrupted - reconnecting. Guests may not hear you yet.';
                        this._changed();
                    } else if (state.connection === 'connected' && state.live && publisher.sfu?.slots.get('musicPub')?.published) {
                        this.live = true;
                        this.status = 'Live - guests joining your audience link hear this input automatically.';
                        this._changed();
                    }
                },
                onError: error => {
                    if (this.publisher === publisher) this.stopBroadcast(`Broadcast stopped: ${error.message}. Your input is still a local test.`);
                }
            });
            this.publisher = publisher;
            await publisher.connect();
            if (revision !== this.revision || this.publisher !== publisher) return;
            await publisher.publish(this.stream);
            if (revision !== this.revision || this.publisher !== publisher) return;
            this.live = true;
            if (this.performAsDJ) this.club._showPerformingDJView?.();
            this.status = 'Live - guests joining your audience link hear this input automatically.';
            this._changed();
        } catch (error) {
            if (revision === this.revision) this.stopBroadcast(`${error.message} Your test is not being broadcast.`);
            throw error;
        } finally {
            if (revision === this.revision) {
                this.goingLive = false;
                this._changed();
            }
        }
    }

    stopBroadcast(message = 'Only you - broadcasting stopped. You can keep testing your input.') {
        const publisher = this.publisher;
        this.publisher = null;
        publisher?.close();
        this.live = false;
        this.status = message;
        this._changed();
    }

    _roomChanged() {
        const mp = this.club.multiplayer;
        if (this.publisher && (!mp.hasLiveEvent || mp.liveEvent.id !== this.eventId)) this.stopBroadcast('Session disconnected or ended. Your input is now only a local test.');
        if (this.stream && !this.retainsInputFor(mp.liveEvent) && (mp.hasLiveEvent || mp.following)) {
            this.stop('The session host supplies the music. Your input has been stopped.');
        }
    }

    stop(message = 'Input stopped. Nothing is being broadcast.') {
        ++this.revision;
        this._cancelJoin?.();
        this.stopBroadcast(message);
        for (const track of this.stream?.getTracks() || []) track.stop();
        this.stream = null;
        clearInterval(this._meter);
        this.splitter?.disconnect();
        for (const analyser of this.analysers || []) analyser.disconnect();
        if (this.remote) this.club.stopNetworkMusic(this.remote);
        this.remote = null;
        this.club.setPerformingAsDJ?.(false);
        this.levels.fill(0);
        this.signal = '';
        this.format = '';
        this.busy = false;
        this.goingLive = false;
        this.monitoring = false;
        this._changed();
    }

    dispose() {
        this.stop();
        this._unsubscribe();
        window.removeEventListener('pagehide', this._onPageHide);
    }
}

window.LiveInput = LiveInput;
