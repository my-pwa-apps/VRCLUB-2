import { test, expect } from '@playwright/test';
import { useQuestHarness } from './support.mjs';

useQuestHarness();
const id = '842bc212-b941-48a1-bcf8-17172a7d47e5';
const publisherToken = 'test-only-publisher-invitation';
const listenerToken = 'test-only-admitted-listener';
const event = { id, title: 'Synthetic live set', live: false, ended: false };
const relay = 'ws://localhost:4173';

async function localIce(page) {
    await page.addInitScript(() => {
        const NativePC = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends NativePC {
            constructor() { super({ iceServers: [] }); }
        };
    });
}

/** Test-only SFU: real Opus/WebRTC, no provider account, credentials or Internet ingest. */
async function mediaBridge(publisher, audience) {
    const sockets = new Set(), replies = [], failures = [];
    let live = false, stopped = false;
    const sendCatalog = () => {
        for (const member of sockets) {
            member.socket.send(JSON.stringify({ type: 'event-status', event: { ...event, live } }));
            if (member.role === 'listener') member.socket.send(JSON.stringify({ type: 'media-catalog',
                tracks: live ? [{ owner: 'event-publisher', kind: 'music', version: 1 }] : [],
                music: { available: live, playing: live, title: event.title } }));
        }
    };
    const handle = async (member, message) => {
        if (message.type === 'event-auth') {
            if (message.token !== (message.role === 'publisher' ? publisherToken : listenerToken)) {
                member.socket.close({ code: 4003, reason: 'Invitation revoked' });
                return;
            }
            member.role = message.role;
            member.socket.send(JSON.stringify({ type: 'live-welcome', id: `${message.role}-connection`, role: message.role, event: { ...event, live } }));
        } else if (message.type === 'media-control') {
            sendCatalog();
        } else if (message.type === 'ping') {
            member.socket.send(JSON.stringify({ type: 'pong', time: message.time, serverTime: Date.now() }));
        } else if (message.type === 'sfu') {
            replies.push({ slot: message.slot, action: message.action });
            let result = {};
            if (message.action === 'publish') {
                result = await publisher.evaluate(async description => {
                    const pc = window.__providerPub = new RTCPeerConnection({ iceServers: [] });
                    window.__providerTracks = [];
                    pc.ontrack = event => {
                        const stream = new window.MediaStream([event.track]), element = new Audio();
                        element.srcObject = stream; element.muted = true;
                        window.__providerElement = element;
                        void element.play().catch(error => { window.__providerPlaybackError = error.message; });
                        const ctx = window.__providerContext = new AudioContext();
                        const source = ctx.createMediaStreamSource(stream), destination = ctx.createMediaStreamDestination();
                        source.connect(destination);
                        window.__providerTracks.push(...destination.stream.getAudioTracks());
                    };
                    await pc.setRemoteDescription(description);
                    await pc.setLocalDescription(window.SFUClient.musicDescription(await pc.createAnswer()));
                    if (pc.iceGatheringState !== 'complete') await new Promise(resolve => {
                        pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') resolve(); });
                    });
                    return { sessionDescription: { type: 'answer', sdp: pc.localDescription.sdp } };
                }, message.description);
            } else if (message.action === 'ready') {
                live = true;
                sendCatalog();
            } else if (message.action === 'subscribe') {
                result = await publisher.evaluate(async () => {
                    const pc = window.__providerRx = new RTCPeerConnection({ iceServers: [] });
                    for (const track of window.__providerTracks) pc.addTransceiver(track, { direction: 'sendonly' });
                    await pc.setLocalDescription(window.SFUClient.musicDescription(await pc.createOffer()));
                    if (pc.iceGatheringState !== 'complete') await new Promise(resolve => {
                        pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') resolve(); });
                    });
                    return { sessionDescription: { type: 'offer', sdp: pc.localDescription.sdp },
                        tracks: pc.getTransceivers().map(transceiver => ({ mid: transceiver.mid, owner: 'event-publisher', kind: 'music', version: 1 })) };
                });
            } else if (message.action === 'answer') {
                await publisher.evaluate(description => window.__providerRx.setRemoteDescription(description), message.description);
            } else if (message.action === 'close') {
                if (member.role === 'publisher') { live = false; sendCatalog(); }
            }
            member.socket.send(JSON.stringify({ type: 'sfu-result', request: message.request, result }));
        }
    };
    for (const page of [publisher, audience]) {
        await localIce(page);
        await page.routeWebSocket(`${relay}/live/**`, socket => {
            const member = { socket, role: null };
            sockets.add(member);
            socket.onMessage(raw => {
                void handle(member, JSON.parse(String(raw))).catch(error => {
                    if (!stopped) {
                        failures.push(error.message);
                        socket.close({ code: 1011, reason: 'Test media bridge failed' });
                    }
                });
            });
            socket.onClose(() => {
                sockets.delete(member);
                if (member.role === 'publisher' && !stopped) { live = false; sendCatalog(); }
            });
        });
    }
    return { replies, failures, revoke() {
        for (const member of sockets) member.socket.close({ code: 4003, reason: 'Invitation revoked' });
    }, async dispose() {
        stopped = true;
        for (const member of sockets) member.socket.close();
        await publisher.evaluate(() => {
            window.__providerPub?.close(); window.__providerRx?.close();
            if (window.__providerElement) { window.__providerElement.pause(); window.__providerElement.srcObject = null; }
            return window.__providerContext?.close();
        });
    } };
}

async function syntheticInput(page) {
    await page.addInitScript(() => {
        window.__captureRequests = [];
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable: true, value: async constraints => {
            window.__captureRequests.push(constraints);
            const ctx = window.__inputContext = new AudioContext({ sampleRate: 48000 });
            await ctx.resume();
            const samples = Math.round(32 * 60 / 124 * 48000), buffer = ctx.createBuffer(2, samples, 48000);
            for (let channel = 0; channel < 2; channel++) {
                const data = buffer.getChannelData(channel);
                for (let i = 0; i < samples; i++) {
                    const time = i / 48000, phase = time % (60 / 124);
                    const kick = 0.65 * Math.exp(-phase * 28) * Math.sin(2 * Math.PI * 55 * time);
                    data[i] = kick + 0.12 * Math.sin(2 * Math.PI * (channel ? 880 : 440) * time);
                }
            }
            const source = window.__inputSource = ctx.createBufferSource();
            source.buffer = buffer; source.loop = true;
            const destination = ctx.createMediaStreamDestination();
            source.connect(destination); source.start();
            window.__capturedStream = destination.stream;
            return destination.stream;
        } });
    });
}

test('browser broadcaster delivers real stereo audio into the club analyser, crowd and show; interruption never substitutes house music', async ({ page, context }) => {
    const publisher = await context.newPage();
    const bridge = await mediaBridge(publisher, page);
    const failures = [];
    for (const browserPage of [page, publisher]) browserPage.on('pageerror', error => failures.push(error.message));
    await syntheticInput(publisher);
    await page.addInitScript(relay => localStorage.setItem('vrclub.networkServerUrl', relay), relay);
    await page.routeWebSocket(`${relay}/?*`, socket => {
        socket.send(JSON.stringify({ type: 'welcome', id: 'audience', pid: '1'.repeat(16), hostId: 'another-host', peers: [],
            room: 'private-live-test-overflow-2', capacity: 32, mediaTransport: 'sfu', liveEvents: true,
            serverTime: Date.now(), liveEvent: { ...event, roomIndex: 2, canManage: false, listenerToken } }));
        socket.onMessage(raw => {
            const message = JSON.parse(String(raw));
            if (message.type === 'ping') socket.send(JSON.stringify({ type: 'pong', time: message.time, serverTime: Date.now() }));
        });
    });
    try {
        await page.goto(`/?event=${id}`);
        await page.locator('#enterClubBtn').click();
        await page.waitForFunction(() => window.vrClub?.ready, null, { timeout: 180000 });
        await page.evaluate(() => {
            const club = window.vrClub;
            club.engine.stopRenderLoop();
            club.engine.getDeltaTime = () => 1000 / 60;
            window.__eventTicker = setInterval(() => { club.updateAnimations(); club.scene.animate(); }, 1000 / 60);
        });
        await expect.poll(() => page.evaluate(() => window.vrClub.multiplayer.hasLiveEvent)).toBe(true);
        expect(await page.evaluate(() => window.vrClub._audioStreamUrl || null)).toBeNull();

        await publisher.goto(`/broadcast/?event=${id}&server=${encodeURIComponent(relay)}#${publisherToken}`);
        await expect(publisher).not.toHaveURL(/#.+/);
        await publisher.locator('#start').click();
        await expect(publisher.locator('#status')).toContainText('Broadcasting live', { timeout: 45000 });
        await expect.poll(() => page.evaluate(() => !!window.vrClub.multiplayer._eventAudio), { timeout: 45000 }).toBe(true);
        await expect(publisher.locator('#leftValue')).not.toHaveText('Silent');
        await expect(publisher.locator('#rightValue')).not.toHaveText('Silent');
        const constraints = await publisher.evaluate(() => window.__captureRequests[0]);
        expect(constraints.video).toBe(false);
        expect(constraints.audio.echoCancellation).toBe(false);
        expect(constraints.audio.noiseSuppression).toBe(false);
        expect(constraints.audio.autoGainControl).toBe(false);
        expect(constraints.audio.channelCount.ideal).toBe(2);

        await page.evaluate(() => {
            const club = window.vrClub, splitter = club.audioContext.createChannelSplitter(2);
            club.multiplayer._eventAudio.source.connect(splitter);
            window.__stereo = [club.audioContext.createAnalyser(), club.audioContext.createAnalyser()];
            window.__stereo.forEach((analyser, index) => { analyser.fftSize = 2048; splitter.connect(analyser, index); });
        });
        await expect.poll(() => page.evaluate(() => {
            const ctx = window.vrClub.audioContext;
            return Math.min(...window.__stereo.map((analyser, channel) => {
                const bins = new Float32Array(analyser.frequencyBinCount);
                analyser.getFloatFrequencyData(bins);
                const at = hz => bins[Math.round(hz / ctx.sampleRate * analyser.fftSize)];
                return channel ? at(880) - at(440) : at(440) - at(880);
            }));
        })).toBeGreaterThan(12);
        await expect.poll(() => page.evaluate(() => window.vrClub.vjDirector.realOnsetCount), { timeout: 45000 }).toBeGreaterThan(6);
        const driven = await page.evaluate(() => {
            const club = window.vrClub;
            return { kind: club._audioKind, title: club.nowPlayingLabel, room: club.multiplayer.currentRoom,
                beat: club._crowdMusic(club.getAudioData()).beatPresent, show: club.showDirector.isDriving(),
                dancers: club.npcAvatars.filter(npc => npc.dance && npc.root.isEnabled() && npc.dance.state.move).length,
                sourceBlocked: club.guardHostControl('music'), safe: club.photosensitiveSafeMode };
        });
        expect(driven.kind).toBe('network');
        expect(driven.title).toBe(event.title);
        expect(driven.room).toBe('private-live-test-overflow-2');
        expect(driven.beat).toBe(true);
        expect(driven.show).toBe(true);
        expect(driven.dancers).toBeGreaterThanOrEqual(4);
        expect(driven.sourceBlocked).toBe(false);
        expect(driven.safe).toBe(true);
        expect(bridge.replies.every(reply => ['musicPub', 'musicRx'].includes(reply.slot))).toBe(true);

        await publisher.locator('#stop').click();
        await expect.poll(() => page.evaluate(() => !!window.vrClub.multiplayer._eventAudio)).toBe(false);
        expect(await publisher.evaluate(() => window.__capturedStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
        expect(await page.evaluate(() => ({ event: window.vrClub.multiplayer.hasLiveEvent, default: window.vrClub.musicLibrary.isDefaultPlaying() })))
            .toEqual({ event: true, default: false });
        expect(bridge.failures).toEqual([]);
        expect(failures).toEqual([]);
    } finally {
        await page.evaluate(() => { clearInterval(window.__eventTicker); window.vrClub?.multiplayer?.disconnect(); });
        await bridge.dispose();
        await publisher.evaluate(() => { window.__inputSource?.stop(); return window.__inputContext?.close(); });
        await publisher.close();
    }
});

test('revoked broadcaster invitations stop capture and never claim a connected publication', async ({ page }) => {
    await syntheticInput(page);
    await page.routeWebSocket(`${relay}/live/**`, socket => {
        socket.onMessage(() => socket.close({ code: 4003, reason: 'Invitation revoked' }));
    });
    await page.goto(`/broadcast/?event=${id}&server=${encodeURIComponent(relay)}#${publisherToken}`);
    await page.locator('#start').click();
    await expect(page.locator('#status')).toContainText('Invitation revoked');
    await expect(page.locator('#start')).toBeEnabled();
    await expect.poll(() => page.evaluate(() => window.__capturedStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
    await page.evaluate(() => { window.__inputSource.stop(); return window.__inputContext.close(); });
});

test('input discovery cannot overlap broadcasting and releases its temporary capture', async ({ page }) => {
    await syntheticInput(page);
    await page.goto(`/broadcast/?event=${id}&server=${encodeURIComponent(relay)}#${publisherToken}`);
    await page.evaluate(() => {
        const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
            configurable: true,
            value: constraints => new Promise(resolve => {
                window.__finishDiscovery = () => resolve(capture(constraints));
            })
        });
    });
    await page.locator('#discover').click();
    await expect(page.locator('#start')).toBeDisabled();
    await page.evaluate(() => window.__finishDiscovery());
    await expect(page.locator('#start')).toBeEnabled();
    expect(await page.evaluate(() => window.__capturedStream.getTracks().every(track => track.readyState === 'ended'))).toBe(true);
    await page.evaluate(() => { window.__inputSource.stop(); return window.__inputContext.close(); });
});
