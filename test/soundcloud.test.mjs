import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function setup({ loadAPI = true } = {}) {
    let clock = 1000;
    const frames = [], scripts = [], widgets = [], messages = [];
    const holder = {
        hidden: true,
        appendChild(frame) { frames.push(frame); },
        replaceChildren() {}
    };
    const events = Object.fromEntries(['READY', 'PLAY', 'PLAY_PROGRESS', 'PAUSE', 'FINISH', 'ERROR'].map(name => [name, name]));
    const Widget = frame => {
        const handlers = new Map();
        const widget = {
            frame, handlers, removed: [],
            bind(event, handler) { handlers.set(event, handler); },
            unbind(event) { this.removed.push(event); handlers.delete(event); },
            isPaused(callback) { this.replyPaused = callback; },
            emit(event) { handlers.get(event)?.(); }
        };
        widgets.push(widget);
        return widget;
    };
    Widget.Events = events;
    const window = loadAPI ? { SC: { Widget } } : {};
    const context = vm.createContext({
        window, URL, performance: { now: () => clock },
        setTimeout, clearTimeout,
        log: { error() {}, warn() {}, info() {} },
        document: {
            head: { appendChild(script) { scripts.push(script); } },
            getElementById: id => id === 'soundCloudPlayer' ? holder : null,
            createElement: tag => ({ tag, remove() { this.removed = true; } })
        },
        VRClubAnimationFinish: class {}
    });
    for (const file of ['club/10-ui.js', 'club/11-audio-crowd.js', 'crowdDance.js', 'djPerformer.js']) {
        vm.runInContext(readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8'), context);
        if (file === 'club/10-ui.js') context.VRClubUI = window.VRClubUI;
    }
    const club = Object.assign(Object.create(window.VRClubAudioCrowd.prototype), {
        showErrorMessage: message => messages.push(message),
        vjDirector: { bpm: 150, beatNumber: 100, realOnsetCount: 2, lastRealOnsetAt: 1000, onsetStreak: 2 },
        showDirector: null, barPhase: 0
    });
    return { club, window, widgets, scripts, frames, holder, messages, setClock: value => { clock = value; } };
}

test('SoundCloud selection and READY alone do not claim playback; confirmed playback drives only choreography', async () => {
    const { club, widgets, setClock } = setup();
    await club.startSoundCloud('https://soundcloud.com/example/set');
    const widget = widgets[0];
    assert.equal(club.getPlaybackInfo().playing, false);
    assert.equal(club._unanalysedDanceMusic(), null);
    widget.emit('READY');
    widget.replyPaused(true);
    assert.equal(club._unanalysedDanceMusic(), null);

    widget.emit('PLAY');
    setClock(2500);
    const fallback = club._crowdMusic({ hasAudio: false, energy: 0 });
    assert.equal(fallback.fallback, true);
    assert.equal(fallback.beat, 3);
    assert.equal(fallback.bpm, 120);
    assert.equal(fallback.energy, 0.55);
    assert.equal(fallback.beatPresent, false);
    assert.equal(fallback.rhythm, false);
    assert.equal(fallback.build, false);
    assert.equal(fallback.drop, false);
    assert.equal(club.getPlaybackInfo().playing, true);
    assert.equal(club.vjDirector.realOnsetCount, 2, 'no fabricated kicks reach the director');
    assert.equal(club._unanalysedDanceMusic(), fallback, 'reuse the clock object');

    widget.emit('PAUSE');
    assert.equal(club._unanalysedDanceMusic(), null);
    assert.equal(club._crowdMusic({ hasAudio: true }).beatPresent, false, 'old FFT/kicks cannot animate a paused iframe');
    setClock(9000);
    widget.emit('PLAY');
    setClock(9500);
    assert.equal(club._unanalysedDanceMusic().beat, 4, 'pause time is excluded from the clock');
    widget.emit('PLAY_PROGRESS');
    assert.equal(club._unanalysedDanceMusic().beat, 4, 'progress does not restart the clock');
    widget.emit('FINISH');
    assert.equal(club.getPlaybackInfo().playing, false);
    widget.emit('PLAY');
    widget.emit('ERROR');
    assert.equal(club._unanalysedDanceMusic(), null);
});

test('late READY replies and old player callbacks cannot override newer state', async () => {
    const { club, widgets } = setup();
    await club.startSoundCloud('https://soundcloud.com/example/first');
    const old = widgets[0];
    old.emit('READY');
    old.emit('PLAY');
    old.replyPaused(true);
    assert.equal(club.getPlaybackInfo().playing, true);
    old.emit('READY');
    const stalePlay = old.handlers.get('PLAY');
    await club.startSoundCloud('https://soundcloud.com/example/second');
    assert.equal(old.removed.length, 6);
    stalePlay();
    old.replyPaused(false);
    assert.equal(club.getPlaybackInfo().playing, false);
    widgets[1].emit('READY');
    widgets[1].replyPaused(false);
    assert.equal(club.getPlaybackInfo().playing, true, 'READY discovers autoplay that preceded binding');
    club._stopSoundCloudPlayer();
    assert.equal(widgets[1].removed.length, 6);
    assert.equal(club._unanalysedDanceMusic(), null);
});

test('lazy Widget API errors surface explicitly and a retry can load it', async () => {
    const { club, scripts, messages, window } = setup({ loadAPI: false });
    const first = club.startSoundCloud('https://soundcloud.com/example/first');
    assert.equal(scripts.length, 1);
    assert.equal(scripts[0].src, 'https://w.soundcloud.com/player/api.js');
    scripts[0].onerror();
    await assert.rejects(first, /tracking could not load/);
    assert.equal(messages.length, 1);
    assert.equal(club._unanalysedDanceMusic(), null);
    const second = club.startSoundCloud('https://soundcloud.com/example/second');
    assert.equal(scripts.length, 2);
    window.SC = setup().window.SC;
    scripts[1].onload();
    await second;
    club._stopSoundCloudPlayer();
});

test('switching sources while the API loads cannot attach a widget to the old player', async () => {
    const { club, scripts, window } = setup({ loadAPI: false });
    const pending = club.startSoundCloud('https://soundcloud.com/example/first');
    club._stopSoundCloudPlayer();
    club._audioKind = 'file';
    window.SC = setup().window.SC;
    scripts[0].onload();
    await pending;
    assert.equal(club._soundCloudWidget, undefined);
    assert.equal(club._unanalysedDanceMusic(), null);
});

test('fallback clock is frame-rate independent and selects varied dancing rather than free sway', async () => {
    for (const fps of [12, 30, 60, 90, 120]) {
        const { club, widgets, window, setClock } = setup();
        await club.startSoundCloud('https://soundcloud.com/example/set');
        widgets[0].emit('PLAY');
        let seed = 42;
        const dance = new window.CrowdDance({ rng: () => {
            seed = (seed * 1664525 + 1013904223) >>> 0;
            return seed / 4294967296;
        } });
        const dancer = dance.createDancer(Object.keys(window.CrowdDance.MOVES));
        const moves = new Set(), out = {};
        for (let frame = 0; frame <= fps * 90; frame++) {
            setClock(1000 + frame / fps * 1000);
            const music = club._crowdMusic({ hasAudio: false });
            dance.step(dancer, music, null, out);
            moves.add(out.move);
            assert.notEqual(out.move, 'Groove_Sway');
            assert.ok(out.speed >= 0.5);
        }
        assert.equal(club._unanalysedDanceMusic().beat, 180);
        assert.ok(moves.size >= 4, `only ${moves.size} moves at ${fps} FPS`);
        widgets[0].emit('PAUSE');
        dance.step(dancer, club._crowdMusic({ hasAudio: false }), null, out);
        assert.equal(out.move, 'Groove_Sway');
    }
});

test('DJ uses the same fallback clock without inventing drops and returns to its calm clock on pause', async () => {
    const { club, widgets, setClock } = setup();
    let input;
    Object.assign(club, {
        _djRig: { ok: true, root: { isEnabled: () => true }, update() {} },
        _djPerformer: { update(dt, music) { input = { ...music }; return {}; } },
        _djMusic: {}, _djVisitors: [], _playerCamera: () => null,
        showDirector: { _movementName: 'ignition', _setPiece: null, setPieces: {}, _energy: 0.45 }
    });
    await club.startSoundCloud('https://soundcloud.com/example/set');
    widgets[0].emit('PLAY');
    setClock(3750);
    club._updateDJ(1 / 60, { hasAudio: false, energy: 0 });
    assert.equal(input.hasAudio, true);
    assert.equal(input.bpm, 120);
    assert.equal(input.bar, 1);
    assert.equal(input.beatPhase, 0.5);
    assert.equal(input.energy, 0.55);
    assert.equal(input.drop, false);
    widgets[0].emit('PAUSE');
    club._updateDJ(1 / 60, { hasAudio: true });
    assert.equal(input.hasAudio, false);
    assert.equal(input.drop, false);
});

test('direct, local and network sources retain real analysis and never fallback merely because they are silent', () => {
    const { club } = setup();
    for (const kind of ['stream', 'file', 'network']) {
        club._audioKind = kind;
        club._soundCloudPlaying = true;
        assert.equal(club._unanalysedDanceMusic(), null);
        assert.equal(club._crowdMusic({ hasAudio: true, energy: 0.9 }).beatPresent, true);
        club._crowdAudioUntil = 0;
        const quiet = club._crowdMusic({ hasAudio: false });
        assert.equal(quiet.beatPresent, false);
        assert.ok(!quiet.fallback);
    }
});
