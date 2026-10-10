import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const relay = process.env.VRCLUB_SFU_RELAY_URL;
test.skip(!relay, 'Set VRCLUB_SFU_RELAY_URL to the isolated development SFU relay.');
test.use({ launchOptions: { args: [
    '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required'
] } });

async function prepare(page, room, name) {
    await page.route('**/sfu-transport-test', route => route.fulfill({
        contentType: 'text/html', body: '<button id="connect">Connect</button><button id="mic">Mic</button><button id="listen">Listen</button>'
    }));
    await page.goto('http://localhost:4173/sfu-transport-test');
    for (const file of ['sfuClient.js', 'networkClient.js']) {
        await page.addScriptTag({ path: fileURLToPath(new URL(`../../js/${file}`, import.meta.url)) });
    }
    await page.evaluate(({ relay, room, name }) => {
        const client = window.client = new window.NetworkClient({ serverUrl: relay, room, name, uid: crypto.randomUUID() });
        const ctx = window.ctx = new AudioContext();
        window.errors = [];
        window.voice = new Map();
        window.music = null;
        window.broadcast = null;
        window.mediaReplies = [];
        window.pcHistory = [];
        const NativePC = window.RTCPeerConnection;
        window.RTCPeerConnection = class extends NativePC {
            constructor(...args) {
                super(...args);
                const report = () => {
                    window.pcHistory.push({ connection: this.connectionState, ice: this.iceConnectionState,
                        gathering: this.iceGatheringState, signaling: this.signalingState });
                    if (window.pcHistory.length > 30) window.pcHistory.shift();
                };
                for (const event of ['connectionstatechange', 'icegatheringstatechange', 'iceconnectionstatechange', 'signalingstatechange']) {
                    this.addEventListener(event, report);
                }
            }
        };
        const receive = client._onMessage.bind(client);
        client._onMessage = event => {
            try {
                const message = JSON.parse(event.data);
                if (['sfu-result', 'media-reset', 'media-catalog'].includes(message.type)) {
                    window.mediaReplies.push({ type: message.type, request: message.request,
                        error: message.error, slot: message.slot, tracks: message.tracks?.length ?? message.result?.tracks?.length,
                        descriptionType: message.result?.sessionDescription?.type });
                    if (window.mediaReplies.length > 30) window.mediaReplies.shift();
                }
            } catch { /* diagnostic parsing must never affect transport */ }
            receive(event);
        };
        client.onError = error => window.errors.push(error.message);
        client.onMusicBroadcast = state => { window.broadcast = state; };
        const connectStream = stream => {
            // Chromium needs the element attachment to deliver remote WebRTC audio
            // into Web Audio; silence the speaker output without stopping the stream.
            const element = new Audio();
            element.srcObject = stream; element.muted = true;
            void element.play().catch(() => {});
            const source = ctx.createMediaStreamSource(stream);
            const analyser = ctx.createAnalyser();
            const gain = ctx.createGain(); gain.gain.value = 0;
            source.connect(analyser); analyser.connect(gain); gain.connect(ctx.destination);
            return { element, source, analyser, gain };
        };
        const stop = state => {
            if (!state) return;
            state.source.disconnect(); state.analyser.disconnect(); state.gain.disconnect();
            state.element.pause(); state.element.srcObject = null;
        };
        client.onRemoteStream = (id, stream) => {
            stop(window.voice.get(id)); window.voice.delete(id);
            if (stream) window.voice.set(id, connectStream(stream));
        };
        client.onRemoteMusic = (id, stream) => {
            stop(window.music);
            window.music = stream ? { id, ...connectStream(stream) } : null;
        };
        document.getElementById('connect').onclick = async () => { await ctx.resume(); client.connect(); };
        document.getElementById('mic').onclick = async () => { await ctx.resume(); await client.enableVoice(); };
        document.getElementById('listen').onclick = async () => { await ctx.resume(); client.setMusicListening(true); };
        window.startMusic = () => {
            const oscillator = ctx.createOscillator();
            oscillator.frequency.value = 440;
            const destination = ctx.createMediaStreamDestination();
            oscillator.connect(destination); oscillator.start();
            window.musicSource = { oscillator, destination };
            client.setLocalMusic(destination.stream, { playing: true, title: 'Development SFU test tone' });
        };
        window.bytes = async slot => {
            const pc = client.sfu?.slots.get(slot)?.pc;
            if (!pc) return 0;
            let bytes = 0;
            for (const stat of (await pc.getStats()).values()) {
                if (stat.type === 'inbound-rtp' && stat.kind === 'audio') bytes += stat.bytesReceived || 0;
            }
            return bytes;
        };
    }, { relay, room, name });
    await page.click('#connect');
    await expect.poll(() => page.evaluate(() => window.client.status)).toBe('connected');
    expect(await page.evaluate(() => window.client.mediaTransport)).toBe('sfu');
}

test('isolated real SFU carries microphones and host music, revokes audiences/blocks, and handles handover', async ({ browser }) => {
    const url = new URL(relay);
    expect(['ws:', 'wss:']).toContain(url.protocol);
    // Do not run an opt-in development fixture against the production relay.
    expect(url.hostname).not.toBe('vrclub-network.garfieldapp.workers.dev');
    expect(url.hostname === 'localhost' || url.hostname === '127.0.0.1' ||
        /dev/i.test(url.hostname.split('.')[0])).toBeTruthy();
    const room = `private-sfu-test-${crypto.randomUUID()}`;
    const contexts = await Promise.all([browser.newContext({ permissions: ['microphone'] }), browser.newContext({ permissions: ['microphone'] })]);
    const [host, guest] = await Promise.all(contexts.map(context => context.newPage()));
    try {
        await prepare(host, room, 'SFU test host');
        await prepare(guest, room, 'SFU test guest');
        await expect.poll(() => host.evaluate(() => window.client.peerCount)).toBe(1);
        await Promise.all([host.click('#mic'), guest.click('#mic')]);
        for (const page of [host, guest]) {
            await expect.poll(() => page.evaluate(() => window.bytes('voiceRx')), { timeout: 30000 }).toBeGreaterThan(0);
            expect(await page.evaluate(() => window.voice.size)).toBe(1);
        }
        await host.evaluate(() => window.client.setVoiceAudience([]));
        await expect.poll(() => guest.evaluate(() => window.voice.size)).toBe(0);
        expect(await host.evaluate(() => window.voice.size)).toBe(1);
        await host.evaluate(() => window.client.setVoiceAudience(null));
        await expect.poll(() => guest.evaluate(() => window.voice.size)).toBe(1);

        await host.evaluate(() => window.startMusic());
        await expect.poll(() => guest.evaluate(() => window.broadcast?.available)).toBe(true);
        expect(await guest.evaluate(() => window.music)).toBeNull();
        await guest.click('#listen');
        await expect.poll(() => guest.evaluate(() => window.bytes('musicRx')), { timeout: 45000 }).toBeGreaterThan(0);
        await guest.evaluate(() => window.client.setMusicListening(false));
        await expect.poll(() => guest.evaluate(() => !!window.music)).toBe(false);
        expect(await guest.evaluate(() => window.voice.size)).toBe(1);

        const pid = await guest.evaluate(() => window.client.selfPid);
        await host.evaluate(pid => window.client.blockPeer(pid), pid);
        for (const page of [host, guest]) {
            await expect.poll(() => page.evaluate(() => window.voice.size)).toBe(0);
        }
        await host.evaluate(pid => window.client.unblockPeer(pid), pid);
        for (const page of [host, guest]) {
            await expect.poll(() => page.evaluate(() => window.voice.size), { timeout: 30000 }).toBe(1);
        }

        const newHost = await guest.evaluate(() => window.client.selfId);
        await host.evaluate(id => window.client.transferHost(id), newHost);
        await expect.poll(() => guest.evaluate(() => window.client.isHost())).toBe(true);
        await expect.poll(() => host.evaluate(() => window.client.sfu.slots.has('musicPub'))).toBe(false);
        await guest.evaluate(() => window.startMusic());
        await expect.poll(() => host.evaluate(() => window.broadcast?.available)).toBe(true);
        await host.click('#listen');
        await expect.poll(() => host.evaluate(() => window.bytes('musicRx')), { timeout: 30000 }).toBeGreaterThan(0);
        for (const page of [host, guest]) expect(await page.evaluate(() => window.errors)).toEqual([]);
    } catch (error) {
        for (const [name, page] of [['host', host], ['guest', guest]]) {
            const diagnostics = await page.evaluate(async () => ({
                status: window.client?.status,
                mic: window.client?.micEnabled,
                errors: window.errors,
                replies: window.mediaReplies,
                history: window.pcHistory,
                slots: await Promise.all([...(window.client?.sfu?.slots || [])].map(async ([name, slot]) => ({
                    name, connection: slot.pc.connectionState, ice: slot.pc.iceConnectionState,
                    gathering: slot.pc.iceGatheringState, signaling: slot.pc.signalingState,
                    published: slot.published, tracks: slot.mids.size,
                    stats: [...(await slot.pc.getStats()).values()].filter(stat => ['inbound-rtp', 'outbound-rtp', 'candidate-pair'].includes(stat.type))
                        .slice(0, 8).map(stat => ({ type: stat.type, state: stat.state, bytesSent: stat.bytesSent,
                            bytesReceived: stat.bytesReceived, packetsReceived: stat.packetsReceived }))
                })))
            })).catch(() => ({ unavailable: true }));
            console.error(`[SFU diagnostic ${name}]`, JSON.stringify(diagnostics));
        }
        throw error;
    } finally {
        for (const page of [host, guest]) {
            await page.evaluate(() => { window.client?.disconnect(); window.musicSource?.oscillator.stop(); void window.ctx?.close(); }).catch(() => {});
        }
        await Promise.all(contexts.map(context => context.close()));
    }
});
