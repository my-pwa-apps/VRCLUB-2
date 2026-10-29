'use strict';

(() => {
    const el = Object.fromEntries(['discover', 'input', 'start', 'stop', 'status', 'format', 'left', 'right', 'leftValue', 'rightValue', 'clipping']
        .map(id => [id, document.getElementById(id)]));
    const params = new URLSearchParams(window.location.search);
    const eventId = params.get('event');
    const serverUrl = params.get('server');
    let token = '';
    try { token = decodeURIComponent(window.location.hash.slice(1)); }
    catch { el.status.textContent = 'This DJ invitation is malformed. Ask the event owner for a replacement.'; }
    const localOnly = !params.has('event') && !params.has('server') && !window.location.hash;
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    let revision = 0, client = null, capture = null, context = null, frame = null, valid = false, clipUntil = 0;
    const status = (message, error = false) => {
        el.status.textContent = message;
        el.status.dataset.error = String(error);
    };
    try {
        if (!localOnly) {
            window.LiveAudioClient.mediaUrl(serverUrl, eventId);
            if (!token || token.length > 512) throw new Error('This invitation is incomplete. Ask the event owner for a new private DJ link.');
        }
        if (!navigator.mediaDevices?.getUserMedia || (!localOnly && !window.RTCPeerConnection)) throw new Error('Use a current browser on HTTPS or localhost to access your audio input.');
        valid = true;
        el.start.disabled = false;
        if (localOnly) {
            el.start.textContent = 'Test my input';
            el.stop.textContent = 'Stop test';
        }
        status(localOnly ? 'Only you - test your mixer here without joining a session. Nothing will be broadcast.'
            : 'Private DJ invitation ready. Choose your mixer, then press Start broadcasting when you are ready for guests to hear it.');
    } catch (error) {
        el.discover.disabled = true;
        el.input.disabled = true;
        status(error.message, true);
    }

    const audioConstraints = () => window.LiveInput.constraints(el.input.value).audio;

    async function stop(message = localOnly ? 'Test stopped. Nothing was broadcast.' : 'Broadcast stopped. You can start again while this invitation is valid.', error = false) {
        revision++;
        const previous = client;
        client = null;
        previous?.close();
        if (frame !== null) cancelAnimationFrame(frame);
        frame = null;
        if (capture) for (const track of capture.getTracks()) track.stop();
        capture = null;
        const audioContext = context;
        context = null;
        if (audioContext && audioContext.state !== 'closed') {
            try { await audioContext.close(); }
            catch (failure) { message = `Audio cleanup failed: ${failure.message}`; error = true; }
        }
        el.left.value = el.right.value = 0;
        el.leftValue.textContent = el.rightValue.textContent = 'Silent';
        clipUntil = 0;
        el.clipping.textContent = 'Keep peaks below clipping.';
        el.clipping.dataset.error = 'false';
        el.start.disabled = !valid;
        el.discover.disabled = !valid;
        el.input.disabled = !valid;
        el.stop.disabled = true;
        status(message, error);
    }

    async function inputs() {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const selected = el.input.value;
        el.input.replaceChildren(new Option('Default recording input', ''));
        for (const [index, device] of devices.filter(device => device.kind === 'audioinput').entries()) {
            el.input.add(new Option(device.label || `Recording input ${index + 1}`, device.deviceId));
        }
        if ([...el.input.options].some(option => option.value === selected)) el.input.value = selected;
        return devices;
    }

    function meter(stream, audioContext) {
        const source = audioContext.createMediaStreamSource(stream);
        const splitter = audioContext.createChannelSplitter(2);
        source.connect(splitter);
        const analysers = [audioContext.createAnalyser(), audioContext.createAnalyser()];
        const buffers = analysers.map(analyser => { analyser.fftSize = 512; return new Float32Array(512); });
        analysers.forEach((analyser, index) => splitter.connect(analyser, index));
        let last = 0;
        const update = now => {
            if (context !== audioContext) return;
            if (now - last >= 65) {
                last = now;
                analysers.forEach((analyser, index) => {
                    analyser.getFloatTimeDomainData(buffers[index]);
                    let peak = 0;
                    for (const sample of buffers[index]) peak = Math.max(peak, Math.abs(sample));
                    const db = peak > 0.00001 ? 20 * Math.log10(peak) : -100;
                    el[index ? 'right' : 'left'].value = Math.max(0, Math.min(1, (db + 60) / 60));
                    el[index ? 'rightValue' : 'leftValue'].textContent = db < -80 ? 'Silent' : `${db.toFixed(1)} dB`;
                    if (peak >= 0.995) clipUntil = now + 1500;
                });
                el.clipping.textContent = now < clipUntil ? 'Input clipping: lower your mixer or interface output.' : 'Keep peaks below clipping.';
                el.clipping.dataset.error = String(now < clipUntil);
            }
            frame = requestAnimationFrame(update);
        };
        frame = requestAnimationFrame(update);
    }

    el.discover.addEventListener('click', async () => {
        if (!valid || capture) return;
        const current = ++revision;
        el.discover.disabled = true;
        el.start.disabled = true;
        let permissionStream;
        try {
            permissionStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: false });
            if (revision !== current) return;
            await inputs();
            if (revision !== current) return;
            status('Inputs found. Select your mixer or interface, not a room microphone.');
        } catch (error) {
            if (revision === current) status(`Could not access recording inputs: ${error.message}`, true);
        }
        finally {
            if (permissionStream) for (const track of permissionStream.getTracks()) track.stop();
            if (revision === current) {
                el.discover.disabled = !!capture;
                el.start.disabled = !valid || !el.stop.disabled;
            }
        }
    });

    el.start.addEventListener('click', async () => {
        if (!valid || !el.stop.disabled || el.discover.disabled) return;
        const current = ++revision;
        el.start.disabled = true;
        el.stop.disabled = false;
        el.discover.disabled = true;
        el.input.disabled = true;
        status('Opening the selected audio input...');
        try {
            const audioContext = context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 48000 });
            await audioContext.resume();
            if (revision !== current) return;
            const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints(), video: false });
            if (revision !== current) {
                for (const track of stream.getTracks()) track.stop();
                return;
            }
            capture = stream;
            const track = stream.getAudioTracks()[0];
            if (!track) throw new Error('The selected input returned no audio track.');
            track.contentHint = 'music';
            track.addEventListener('ended', () => { void stop('Audio input disconnected. Reconnect it and start again.', true); }, { once: true });
            const settings = track.getSettings();
            const channels = settings.channelCount;
            el.format.textContent = `Actual input: ${channels || 'unreported'} channel${channels === 1 ? '' : 's'}, ${settings.sampleRate || 'unreported'} Hz. Opus stereo requested; 192 kbit/s target, not a guaranteed network rate.`;
            if (channels !== 2) el.format.textContent += channels === 1 ? ' This input is MONO.' : ' The browser has not confirmed a stereo input.';
            if (settings.echoCancellation || settings.noiseSuppression || settings.autoGainControl) {
                el.format.textContent += ' Warning: the browser kept voice processing enabled; use a music-capable input/browser.';
            }
            meter(stream, audioContext);
            if (localOnly) {
                status('Only you - your input is being tested, not broadcast. Check that both bars move. Open the club to test its crowd and lights.');
                return;
            }
            status('Connecting your private live audio feed...');
            const live = new window.LiveAudioClient({
                serverUrl, eventId, token, role: 'publisher',
                onState: state => {
                    if (client !== live) return;
                    if (state.ended) {
                        valid = false;
                        void stop('This event has ended. Ask its owner for a new invitation.');
                    } else if (state.connection === 'reconnecting') status('Live audio interrupted. Reconnecting; keep your mixer running.');
                    else if (state.live) status(`Broadcasting live: ${state.title}. Your audience can now hear this input.`);
                },
                onError: error => { if (client === live) void stop(`Broadcast interrupted: ${error.message}`, true); }
            });
            client = live;
            await live.connect();
            if (revision !== current) return;
            await live.publish(stream);
            if (revision !== current) return;
            status(`Broadcasting live: ${live.event.title}. Check both input meters and ask an audience member to confirm reception.`);
        } catch (error) {
            if (revision === current) await stop(window.LiveInput.inputError(error), true);
        }
    });
    el.stop.addEventListener('click', () => { void stop(); });
    navigator.mediaDevices?.addEventListener('devicechange', () => {
        void inputs().then(devices => {
            const inputId = capture?.getAudioTracks()[0]?.getSettings().deviceId;
            if (inputId && !devices.some(device => device.deviceId === inputId)) {
                void stop('The recording input was removed. Choose an input and start again.', true);
            }
        }).catch(error => status(`Could not refresh audio inputs: ${error.message}`, true));
    });
    window.addEventListener('pagehide', () => { void stop(localOnly ? 'Sound check closed.' : 'Broadcast closed.'); }, { once: true });
})();
