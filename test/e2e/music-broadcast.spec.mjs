import { test, expect } from '@playwright/test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

async function prepare(page, id, hostId, peerIds = null) {
    await page.route('**/broadcast-test', route => route.fulfill({
        contentType: 'text/html', body: '<button id="listen">Listen along</button><button id="play">Play local file</button>'
    }));
    await page.goto('http://localhost:4173/broadcast-test');
    await page.evaluate(() => {
        window.VRClubAnimationFinish = class {};
        window.log = { info() {}, warn() {}, error() {} };
        window.BABYLON = { Vector3: class { constructor(x = 0, y = 0, z = 0) { Object.assign(this, { x, y, z }); } } };
        window.CLUB_POSITIONS = { paSpeakers: { left: { x: -6, y: 7.1, z: -16 }, right: { x: 6, y: 7.1, z: -16 } } };
    });
    for (const file of ['js\\audioUtils.js', 'js\\networkClient.js', 'js\\multiplayer.js',
        'js\\club\\10-ui.js', 'js\\club\\11-audio-crowd.js']) {
        await page.addScriptTag({ path: join(ROOT, file) });
    }
    await page.evaluate(({ id, hostId, peerIds }) => {
        const club = window.club = new window.VRClubAudioCrowd();
        club._startCrowdAmbience = () => {};
        club.errors = [];
        club.showErrorMessage = message => club.errors.push(message);
        club._audioVolume = 1;
        club._audioFrameData = { kickSteps: { count: 0 } };
        club.guardHostControl = () => true;
        const mp = club.multiplayer = new window.ClubMultiplayer(club, { storage: null });
        const client = mp.client = club.networkManager = new window.NetworkClient();
        client.status = 'connected';
        client.selfId = id;
        client.hostId = hostId;
        const otherId = id === hostId ? 'guest' : hostId;
        for (const peerId of peerIds || [otherId]) {
            client.peers.set(peerId, { name: peerId, pid: 'b'.repeat(16), pc: null });
        }
        club.voiceStreams = 0;
        mp.manager = { setHost() {}, removePeer() {}, attachVoice() { club.voiceStreams++; } };
        mp._wire(client);
        mp._syncRole();
        client._send = message => window.forwardSignal(message).catch(error => club.errors.push(error.message));
        document.getElementById('listen').onclick = () => mp.acceptListenAlong();
        document.getElementById('play').onclick = async () => {
            const samples = 48000 * 30;
            const wav = new ArrayBuffer(44 + samples * 2);
            const data = new DataView(wav);
            const text = (offset, value) => [...value].forEach((c, i) => data.setUint8(offset + i, c.charCodeAt(0)));
            text(0, 'RIFF'); data.setUint32(4, wav.byteLength - 8, true); text(8, 'WAVE');
            text(12, 'fmt '); data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
            data.setUint32(24, 48000, true); data.setUint32(28, 96000, true);
            data.setUint16(32, 2, true); data.setUint16(34, 16, true); text(36, 'data');
            data.setUint32(40, samples * 2, true);
            for (let i = 0; i < samples; i++) data.setInt16(44 + i * 2, 6000 * Math.sin(2 * Math.PI * 440 * i / 48000), true);
            await club.startAudioFromFile(new File([wav], 'broadcast.wav', { type: 'audio/wav' }));
            club._shareAudioPosition();
        };
        window.level = () => {
            if (!club.audioAnalyser) return 0;
            const samples = new Float32Array(club.audioAnalyser.fftSize);
            club.audioAnalyser.getFloatTimeDomainData(samples);
            return Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);
        };
    }, { id, hostId, peerIds });
}

test('a real local file reaches a consenting guest through WebRTC and the club PA graph', async ({ browser }) => {
    const hostContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const host = await hostContext.newPage();
    const guest = await guestContext.newPage();
    try {
        await Promise.all([prepare(host, 'host', 'host'), prepare(guest, 'guest', 'host')]);
        for (const [page, remote, from] of [[host, guest, 'host'], [guest, host, 'guest']]) {
            await page.exposeFunction('forwardSignal', async message => {
                if (message.type === 'rtc-signal') {
                    await remote.evaluate(({ from, signal }) => {
                        void window.club.multiplayer.client._onSignal(from, signal);
                    }, { from, signal: message.signal });
                }
            });

        }
        await host.click('#play');
        await expect.poll(() => guest.evaluate(() => !!window.club.multiplayer.pendingMusic?.broadcast)).toBe(true);
        expect(await guest.evaluate(() => window.club.multiplayer.client.peers.get('host').musicPc == null)).toBe(true);
        expect(await guest.evaluate(() => window.level())).toBe(0);
        await guest.click('#listen');
        await expect.poll(() => guest.evaluate(() => window.level()), { timeout: 20000 }).toBeGreaterThan(0.03);
        const routing = await guest.evaluate(() => ({
            source: window.club._audioKind,
            voice: window.club.multiplayer.client.peers.get('host').pc,
            seekable: window.club.getPlaybackInfo().seekable,
            playing: window.club.getPlaybackInfo().playing,
            pa: !!window.club.pannerLeft && !!window.club.subGain,
            kick: !!window.club.kickAnalyser && !!window.club.rhythmAnalyser
        }));
        expect(routing).toEqual({ source: 'network', voice: null, seekable: false, playing: true, pa: true, kick: true });
        expect(await guest.evaluate(() => window.club.voiceStreams)).toBe(0);
        await host.evaluate(() => {
            const client = window.club.multiplayer.client;
            const ctx = window.club.audioContext;
            const oscillator = ctx.createOscillator();
            oscillator.frequency.value = 880;
            const mic = ctx.createMediaStreamDestination();
            oscillator.connect(mic);
            oscillator.start();
            client.micStream = mic.stream;
            client.micEnabled = true;
            client._attachLocalTracks('guest');
        });
        await expect.poll(() => guest.evaluate(() => window.club.voiceStreams)).toBe(1);
        await expect.poll(() => guest.evaluate(() => window.level())).toBeGreaterThan(0.03);
        await host.evaluate(() => window.club.multiplayer.client.disableVoice());
        await expect.poll(() => guest.evaluate(() => window.level())).toBeGreaterThan(0.03);
        await guest.evaluate(() => window.club.setAudioVolume(0));
        await expect.poll(() => guest.evaluate(() => window.level())).toBeLessThan(0.001);
        await guest.evaluate(() => window.club.setAudioVolume(1));
        await expect.poll(() => guest.evaluate(() => window.level())).toBeGreaterThan(0.03);
        await host.evaluate(() => { window.club.audioElement.pause(); window.club._shareAudioPosition(); });
        await expect.poll(() => guest.evaluate(() => window.level())).toBeLessThan(0.001);
        await host.evaluate(async () => { await window.club.audioElement.play(); window.club._shareAudioPosition(); });
        await expect.poll(() => guest.evaluate(() => window.level())).toBeGreaterThan(0.03);
        await host.evaluate(() => { window.club.seekAudioTo(5); });
        await expect.poll(() => guest.evaluate(() => window.level())).toBeGreaterThan(0.03);
        await guest.evaluate(() => window.club.multiplayer.client.blockPeer('b'.repeat(16)));
        await expect.poll(() => guest.evaluate(() => window.level())).toBeLessThan(0.001);
        expect(await guest.evaluate(() => window.club._networkMusic)).toBeNull();
        expect(await guest.evaluate(() => window.club.errors)).toEqual([
            'You can no longer see the host, so your music and lights are your own again.'
        ]);
        expect(await host.evaluate(() => window.club.errors)).toEqual([]);
    } finally {
        await Promise.all([hostContext.close(), guestContext.close()]);
    }
});

test('real microphone audio reaches only selected guests and changing recipients preserves incoming voice', async ({ browser }) => {
    const contexts = await Promise.all(Array.from({ length: 3 }, () => browser.newContext()));
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    const ids = ['a', 'b', 'c'];
    try {
        await Promise.all(pages.map((page, i) => prepare(page, ids[i], 'a', ids.filter(id => id !== ids[i]))));
        for (let i = 0; i < pages.length; i++) {
            const page = pages[i];
            await page.exposeFunction('forwardSignal', async message => {
                if (message.type !== 'rtc-signal') return;
                const remote = pages[ids.indexOf(message.target)];
                await remote.evaluate(({ from, signal }) => {
                    void window.club.multiplayer.client._onSignal(from, signal);
                }, { from: ids[i], signal: message.signal });
            });
            await page.evaluate(() => {
                document.getElementById('listen').onclick = async () => {
                    const ctx = window.voiceContext = new AudioContext();
                    await ctx.resume();
                    window.voiceInputs = new Map();
                    window.club.multiplayer.client.onRemoteStream = (id, stream) => {
                        const element = document.createElement('audio');
                        element.muted = true;
                        element.srcObject = stream;
                        document.body.appendChild(element);
                        void element.play();
                        const source = ctx.createMediaStreamSource(stream);
                        const analyser = ctx.createAnalyser();
                        source.connect(analyser);
                        window.voiceInputs.set(id, { source, analyser, element });
                    };
                    window.voiceLevel = id => {
                        const analyser = window.voiceInputs.get(id)?.analyser;
                        if (!analyser) return 0;
                        const samples = new Float32Array(analyser.fftSize);
                        analyser.getFloatTimeDomainData(samples);
                        return Math.sqrt(samples.reduce((sum, n) => sum + n * n, 0) / samples.length);
                    };
                    window.sendTone = () => {
                        const oscillator = ctx.createOscillator();
                        const destination = ctx.createMediaStreamDestination();
                        oscillator.frequency.value = 880;
                        oscillator.connect(destination);
                        oscillator.start();
                        const client = window.club.multiplayer.client;
                        client.micStream = destination.stream;
                        client.micEnabled = true;
                        for (const id of client.peers.keys()) client._attachLocalTracks(id);
                        window.tone = oscillator;
                    };
                };
            });
            await page.click('#listen');
        }
        const [a, b, c] = pages;
        await a.evaluate(() => { window.club.multiplayer.setAudience('voice', ['b']); window.sendTone(); });
        await expect.poll(() => b.evaluate(() => window.voiceLevel('a')), { timeout: 20000 }).toBeGreaterThan(0.03);
        expect(await c.evaluate(() => window.club.multiplayer.client.peers.get('a').pc)).toBeNull();
        expect(await c.evaluate(() => window.voiceLevel('a'))).toBe(0);
        await b.evaluate(() => { window.club.multiplayer.setAudience('voice', ['a']); window.sendTone(); });
        await expect.poll(() => a.evaluate(() => window.voiceLevel('b')), { timeout: 20000 }).toBeGreaterThan(0.03);
        await a.evaluate(() => window.club.multiplayer.setAudience('voice', ['c']));
        await expect.poll(() => c.evaluate(() => window.voiceLevel('a')), { timeout: 20000 }).toBeGreaterThan(0.03);
        await expect.poll(() => b.evaluate(() => window.voiceLevel('a'))).toBeLessThan(0.001);
        await expect.poll(() => a.evaluate(() => window.voiceLevel('b'))).toBeGreaterThan(0.03);
        await a.evaluate(() => window.club.multiplayer.setAudience('voice', ['b', 'c']));
        await expect.poll(() => b.evaluate(() => window.voiceLevel('a'))).toBeGreaterThan(0.03);
        await expect.poll(() => c.evaluate(() => window.voiceLevel('a'))).toBeGreaterThan(0.03);
        await a.evaluate(() => window.club.multiplayer.setAudience('voice', []));
        await expect.poll(() => b.evaluate(() => window.voiceLevel('a'))).toBeLessThan(0.001);
        await expect.poll(() => c.evaluate(() => window.voiceLevel('a'))).toBeLessThan(0.001);
        await expect.poll(() => a.evaluate(() => window.voiceLevel('b'))).toBeGreaterThan(0.03);
        for (const page of pages) expect(await page.evaluate(() => window.club.errors)).toEqual([]);
    } finally {
        await Promise.all(contexts.map(context => context.close()));
    }
});

test('desktop recipient selectors share controller state, preserve keyboard focus and never auto-select newcomers', async ({ page }) => {
    await page.exposeFunction('forwardSignal', () => {});
    await prepare(page, 'a', 'a', ['b', 'c']);
    const ui = readFileSync(join(ROOT, 'js', 'ui-init.js'), 'utf8');
    const start = ui.indexOf('function initAudienceSelector(');
    const end = ui.indexOf('\n/**', start);
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    await page.addScriptTag({ content: `const uiTeardowns = []; ${ui.slice(start, end)} window.initAudienceSelector = initAudienceSelector;` });
    await page.evaluate(() => {
        const mp = window.club.multiplayer;
        mp.manager.ensurePeer = () => {};
        mp.manager.list = () => [...mp.client.peers].map(([id, peer]) => ({ id, name: peer.name }));
        for (const scope of ['chat', 'voice']) {
            const root = document.createElement('div');
            root.id = `${scope}-selector`;
            document.body.appendChild(root);
            window.initAudienceSelector(mp, root, scope);
        }
    });
    const chat = page.locator('#chat-selector');
    const voice = page.locator('#voice-selector');
    await chat.getByRole('button', { name: 'Selected guests' }).click();
    await chat.getByRole('checkbox', { name: 'b', exact: true }).check();
    await chat.getByRole('checkbox', { name: 'c', exact: true }).check();
    await expect(chat.getByRole('checkbox', { name: 'c', exact: true })).toBeFocused();
    await voice.getByRole('button', { name: 'Selected guests' }).click();
    await voice.getByRole('checkbox', { name: 'c', exact: true }).check();
    expect(await page.evaluate(() => [window.club.multiplayer.chatAudience, window.club.multiplayer.voiceAudience]))
        .toEqual([['b', 'c'], ['c']]);
    await page.evaluate(() => {
        const mp = window.club.multiplayer;
        mp.client._addPeer({ id: 'd', name: 'd' });
        mp.setAudience('chat', mp.chatAudience);
    });
    await expect(chat.getByRole('checkbox', { name: 'd', exact: true })).not.toBeChecked();
    await expect(voice.getByRole('checkbox', { name: 'd', exact: true })).not.toBeChecked();
    await page.evaluate(() => window.club.multiplayer.setAudience('voice', []));
    await expect(voice).toContainText('Nobody selected');
    await chat.getByRole('button', { name: 'Everyone', exact: true }).click();
    expect(await page.evaluate(() => window.club.multiplayer.chatAudience)).toBeNull();
    expect(await page.evaluate(() => window.club.multiplayer.voiceAudience)).toEqual([]);
});
