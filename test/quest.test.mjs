import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { questConfiguration, parseKeytoolFingerprint } from '../scripts/prepare-quest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'js', 'musicLibrary.js'), 'utf8');
const audioUtilsSource = readFileSync(path.join(root, 'js', 'audioUtils.js'), 'utf8');

function libraryFixture(raw = null, feed = '', playbackRaw = null) {
    const messages = [], plays = [];
    const store = new Map(raw !== null ? [['vrclub.questMusic', raw]] : []);
    if (playbackRaw) store.set('vrclub.questMusicPlayback', playbackRaw);
    const storage = { getItem: key => store.has(key) ? store.get(key) : null, setItem: (key, value) => store.set(key, value) };
    const fetches = [];
    const context = vm.createContext({
        URL,
        TextDecoder,
        window: { location: { href: 'https://club.example/' } },
        console: { warn: (...args) => messages.push(args) }
    });
    vm.runInContext(audioUtilsSource, context);
    vm.runInContext(source, context);
    const club = {
        showErrorMessage: message => messages.push(message),
        guardHostControl: () => true,
        startAudioStream: async (...args) => {
            club._audioStreamUrl = args[0];
            plays.push(['direct', ...args]);
        },
        getPlaybackInfo: () => ({ seekable: true, position: 0, duration: 3600, playing: true }),
        startSoundCloud: async (...args) => plays.push(['soundcloud', ...args])
    };
    const fetchBuffer = async (url, options) => {
        fetches.push([url, options]);
        const body = typeof feed === 'function' ? feed(url, options) : feed;
        if (body instanceof Error) throw body;
        return new TextEncoder().encode(body).buffer;
    };
    const library = new context.window.MusicLibrary(club, storage, {
        fetchBuffer,
        getRelay: () => 'wss://vrclub-network.garfieldapp.workers.dev/custom/path'
    });
    return { library, club, storage, store, messages, plays, fetches };
}

test('replaceAll makes the saved sets match the phone\u2019s list, keeping the selection, names and episode choices', () => {
    const f = libraryFixture();
    f.library.save('https://audio.example/one.mp3', 'One');
    f.library.save('https://audio.example/two.mp3', 'Two');
    f.library.save('https://audio.example/three.mp3', 'Three');
    f.library.select(1);

    // Re-ordered, one removed, one added; the selected link is still listed, so it stays selected at its new position.
    let outcome = f.library.replaceAll([
        { url: 'https://audio.example/three.mp3', name: 'Three' }, { url: 'https://audio.example/two.mp3' },
        { url: 'https://audio.example/four.mp3', name: 'Four' }
    ]);
    assert.deepEqual({ ...outcome }, { count: 3, skipped: 0, changed: true });
    assert.deepEqual(Array.from(f.library.items.map(item => item.url)), ['https://audio.example/three.mp3', 'https://audio.example/two.mp3', 'https://audio.example/four.mp3']);
    assert.equal(f.library.current().url, 'https://audio.example/two.mp3');
    assert.equal(f.library.current().name, 'Two', 'a blank name on the phone keeps the name the headset already has');
    assert.equal(JSON.parse(f.store.get('vrclub.questMusic')).items.length, 3, 'it is persisted');

    // The same list again is not a change and writes nothing.
    const before = f.store.get('vrclub.questMusic');
    f.store.set('vrclub.questMusic', before + ' ');
    outcome = f.library.replaceAll(f.library.items.map(item => ({ url: item.url, name: item.name })));
    assert.equal(outcome.changed, false);
    assert.equal(f.store.get('vrclub.questMusic'), before + ' ');

    // The selected link removed: selection falls back to the first set. An empty list empties the library.
    f.library.replaceAll([{ url: 'https://audio.example/four.mp3' }]);
    assert.equal(f.library.current().url, 'https://audio.example/four.mp3');
    assert.deepEqual({ ...f.library.replaceAll([]) }, { count: 0, skipped: 0, changed: true });
    assert.equal(f.library.current(), null);
});

test('replaceAll skips links that cannot be played, drops duplicates, caps at eight and ignores junk input', () => {
    const f = libraryFixture();
    const entries = [
        { url: 'https://audio.example/a.mp3', name: 'A' }, { url: 'https://audio.example/a.mp3', name: 'A again' },
        { url: 'http://insecure.example/b.mp3' }, { url: 'https://www.youtube.com/watch?v=x' }, { url: 'not a url' }, null, {},
        ...Array.from({ length: 9 }, (_, i) => ({ url: `https://audio.example/${i}.mp3` }))
    ];
    const outcome = f.library.replaceAll(entries);
    assert.equal(outcome.count, 8);
    assert.equal(outcome.skipped, 5, 'insecure, YouTube, not a URL, null and an empty object');
    assert.equal(f.library.items[0].name, 'A', 'the first of two duplicates wins');
    assert.deepEqual({ ...f.library.replaceAll('nonsense') }, { count: 0, skipped: 0, changed: true });
});

test('Quest music starts empty, persists user sets and wraps selection without auto-playing', () => {
    const f = libraryFixture();
    assert.equal(f.library.current(), null);
    assert.equal(f.plays.length, 0);
    f.library.save('https://audio.example/one.mp3', 'First');
    f.library.save('https://audio.example/two.mp3', 'Second');
    f.library.step(1);
    assert.equal(f.library.current().name, 'First');
    f.library.step(-1);
    assert.equal(f.library.current().name, 'Second');
    f.library.save('https://audio.example/two.mp3', 'Renamed');
    assert.equal(f.library.items.length, 2);
    const restored = libraryFixture(f.store.get('vrclub.questMusic')).library;
    assert.equal(restored.current().name, 'Renamed');
    restored.remove();
    assert.equal(restored.current().name, 'First');
    restored.remove();
    assert.equal(restored.current(), null);
    assert.throws(() => restored.remove(), /No saved set/);
    assert.throws(() => restored.step(1), /No saved sets/);
});

test('the Link tab offers Play now and Save to my sets, never Pause, and explains what each does while another set plays', () => {
    const f = libraryFixture();
    const playing = { url: 'https://audio.example/playing.mp3', playing: true };
    // Nothing pasted: nothing to save.
    let action = f.library.linkAction('', {});
    assert.deepEqual([action.play.label, action.play.disabled, action.save.disabled, action.note], ['Play now', false, true, '']);
    // A new link while another set plays: both choices are explained, and neither is a Pause button.
    f.library.save('https://audio.example/playing.mp3', 'Playing');
    action = f.library.linkAction('https://audio.example/other.mp3', playing);
    assert.equal(action.play.label, 'Play now');
    assert.equal(action.save.label, 'Save to my sets');
    assert.equal(action.save.disabled, false);
    assert.match(action.note, /Another set is playing/);
    assert.match(action.note, /Save to my sets adds it and keeps the current set playing/);
    // Saving it changes the offer: it can now be played as a saved set, and is no longer savable.
    f.library.save('https://audio.example/other.mp3', 'Other');
    action = f.library.linkAction('https://audio.example/other.mp3', playing);
    assert.equal(action.play.label, 'Play this set');
    assert.deepEqual([action.save.label, action.save.disabled], ['Saved in my sets', true]);
    assert.match(action.note, /switches to it/);
    // The link that is playing says so, and offers Resume only when paused.
    action = f.library.linkAction('https://audio.example/playing.mp3', playing);
    assert.deepEqual([action.play.label, action.play.disabled], ['Playing now', true]);
    action = f.library.linkAction('https://audio.example/playing.mp3', { ...playing, playing: false });
    assert.deepEqual([action.play.label, action.play.disabled], ['Resume', false]);
    // A full library cannot take another link; an unusable link still lets Play now report why.
    for (let i = 0; i < 6; i++) f.library.save(`https://audio.example/fill-${i}.mp3`, `Fill ${i}`);
    assert.equal(f.library.items.length, 8);
    action = f.library.linkAction('https://audio.example/ninth.mp3', playing);
    assert.deepEqual([action.save.label, action.save.disabled], ['Sets full (8)', true]);
    action = f.library.linkAction('not a link', playing);
    assert.equal(action.play.disabled, false);
});

test('Quest music rejects unsafe and website links, invalid selection and capacity overflow', () => {
    const { library } = libraryFixture();
    for (const url of ['http://audio.example/a', 'javascript:alert(1)', 'blob:https://audio.example/a',
        'https://user:pass@audio.example/a', 'https://www.youtube.com/watch?v=x',
        'https://youtu.be/x', 'https://open.spotify.com/track/x']) {
        assert.throws(() => library.save(url), /HTTPS|music website/);
    }
    const soundcloudLibrary = libraryFixture().library;
    const soundcloud = soundcloudLibrary.save('https://soundcloud.com/user/set?si=tracking&utm_source=clipboard');
    assert.equal(soundcloud.kind, 'soundcloud');
    assert.equal(soundcloud.url, 'https://soundcloud.com/user/set');
    for (let i = 0; i < 8; i++) library.save(`https://audio.example/${i}.mp3`);
    assert.throws(() => library.save('https://audio.example/extra.mp3'), /Eight/);
    library.save('https://audio.example/0.mp3', 'Updated');
    assert.equal(library.items.length, 8);
    for (const index of [-1, 8, 0.5, NaN]) assert.throws(() => library.select(index), /Choose/);
    assert.throws(() => library.step(0.5), /previous or next/);
});

test('feed URLs and SoundCloud pages are classified for analysed playback', () => {
    const kind = url => libraryFixture().library.save(url).kind;
    for (const url of [
        'https://soundcloud.com/missmelera/colourizon-168',
        'https://soundcloud.com/some-dj/summer-mix-2026',
        'https://soundcloud.com/missmelera/sets/x',
        'https://soundcloud.com/missmelera',
    ]) {
        assert.equal(kind(url), 'soundcloud', url);
    }
    for (const url of [
        'https://podcast.hernancattaneo.com/feed.xml',
        'https://podcast.hernancattaneo.com/',
    ]) {
        assert.equal(kind(url), 'feed', url);
    }
    for (const url of ['https://feeds.example/show/feed', 'https://feeds.example/show.rss']) {
        assert.equal(kind(url), 'direct', 'only hosts the CSP allows are read as feeds: ' + url);
    }
    assert.equal(kind('https://podcast.hernancattaneo.com/ep.mp3'), 'direct');
    const upgraded = libraryFixture().library.save('http://podcast.hernancattaneo.com/feed.xml');
    assert.equal(upgraded.url, 'https://podcast.hernancattaneo.com/feed.xml', 'a pasted http:// Resident link is saved over https');
});

test('storage failures are explicit and never mutate the saved selection', () => {
    const f = libraryFixture();
    f.library.save('https://audio.example/one.mp3', 'First');
    f.storage.setItem = () => { throw new Error('quota'); };
    assert.throws(() => f.library.save('https://audio.example/two.mp3'), /Could not save.*quota/);
    assert.equal(f.library.items.length, 1);
    assert.equal(f.library.current().name, 'First');
    for (const raw of ['not JSON', '{"items":[null]}', '{"items":[{"url":"http://bad.example"}]}']) {
        const bad = libraryFixture(raw);
        assert.equal(bad.library.current(), null);
        assert.ok(bad.messages.some(message => String(message).includes('could not be read')));
    }
});

test('saved playback uses the shared audio API, plays once and respects host ownership', async () => {
    const f = libraryFixture();
    await assert.rejects(f.library.play(), /No saved sets/);
    f.library.save('https://audio.example/one.mp3', 'My set');
    assert.equal(await f.library.play(), true);
    assert.equal(f.plays[0][0], 'direct');
    assert.equal(f.plays[0][1], 'https://audio.example/one.mp3');
    assert.equal(f.plays[0][2].onDemand, true);
    assert.equal(f.club.nowPlayingLabel, 'My set');
    f.club.guardHostControl = () => false;
    assert.equal(await f.library.play(), false);
    assert.equal(f.plays.length, 1);
    f.club.guardHostControl = () => true;
    f.club.startAudioStream = async () => { throw new Error('CORS unavailable'); };
    await assert.rejects(f.library.play(), /CORS unavailable/);
});

test('an expired signed Podbean link plays through the Resident feed\u2019s stable link for the same episode', async () => {
    const feed = '<rss><channel><item><title>806</title><enclosure url="https://mcdn.podbean.com/mf/web/aaa/806-HernanCattaneo-2026-10-17.mp3" type="audio/mpeg"/></item>'
        + '<item><title>805</title><enclosure url="https://mcdn.podbean.com/mf/web/bbb/805-HernanCattaneo-2026-10-10.mp3" type="audio/mpeg"/></item></channel></rss>';
    const f = libraryFixture(null, feed);
    const signed = 'https://s363.podbean.com/pb/932877322d9f7fc594f21e7e87325da9/6acf4a58/data1/fs80/274700/uploads/805-HernanCattaneo-2026-10-10.mp3?pbss=38a5f7c3';
    assert.equal(f.library.constructor.isSignedPodbeanUrl(signed), true);
    assert.equal(f.library.constructor.isSignedPodbeanUrl('https://mcdn.podbean.com/mf/web/bbb/805-HernanCattaneo-2026-10-10.mp3'), false);
    f.library.save(signed, 'Hernan 805');
    await f.library.play();
    assert.equal(f.plays[0][1], 'https://mcdn.podbean.com/mf/web/bbb/805-HernanCattaneo-2026-10-10.mp3');

    // An episode the feed does not list is attempted as saved.
    const other = libraryFixture(null, feed);
    const unknown = 'https://s363.podbean.com/pb/abc/1/uploads/999-Other.mp3?pbss=1';
    other.library.save(unknown, 'Other');
    await other.library.play();
    assert.equal(other.plays[0][1], unknown);
});

test('when a saved set cannot be played the club\u2019s own set takes over, but never for an autoplay block or in someone else\u2019s room', async () => {
    const fixture = () => {
        const f = libraryFixture();
        f.library.save('https://audio.example/broken.mp3', 'Broken');
        f.club.startAudioStream = async (url, options) => {
            if (url.endsWith('broken.mp3')) throw new Error('CORS unavailable');
            f.club._audioStreamUrl = url;
            f.club.audioElement = { paused: false };
            f.plays.push(['direct', url, options]);
        };
        return f;
    };

    const f = fixture();
    await assert.rejects(f.library.play(), /CORS unavailable/, 'the failure is still reported');
    assert.equal(f.plays.length, 1);
    assert.equal(f.plays[0][1], 'https://club.example/audio/nocturne-house.mp3');
    assert.equal(f.library.isDefaultPlaying(), true);
    assert.equal(f.club.nowPlayingLabel, 'NOCTURNE House (club set)');
    assert.equal(f.library.items.length, 1, 'the saved set stays in the list');
    assert.ok(f.messages.some(message => /club.s own set is playing/.test(String(message))), 'the guest is told');
    // A second failure while the club\u2019s set already plays does not restart it.
    await assert.rejects(f.library.play(), /CORS unavailable/);
    assert.equal(f.plays.length, 1);

    const blocked = fixture();
    blocked.club.startAudioStream = async () => { throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' }); };
    await assert.rejects(blocked.library.play(), /blocked/);
    assert.equal(blocked.plays.length, 0, 'autoplay blocked is retried on a gesture, not a failure');

    const guest = fixture();
    guest.club.isFollowingHost = () => true;
    await assert.rejects(guest.library.play(), /CORS unavailable/);
    assert.equal(guest.plays.length, 0, 'the host owns the music in a room');

    const dropped = fixture();
    assert.equal(await dropped.library.fallBackToDefault(), true, 'a stream that dropped mid-set is replaced too');
    assert.equal(dropped.library.isDefaultPlaying(), true);

    const nothing = libraryFixture();
    await assert.rejects(nothing.library.play(), /No saved sets/);
    assert.equal(nothing.plays.length, 0, 'with nothing saved there is no set to fall back from');

    const bothFail = fixture();
    bothFail.club.startAudioStream = async () => { throw new Error('offline'); };
    await assert.rejects(bothFail.library.play(), /offline/);
    assert.equal(bothFail.library.isDefaultPlaying(), false, 'a failing club set does not loop or leave a stale marker');
});

test('restarting the same saved stream resumes its last finite playback position', async () => {
    const first = libraryFixture();
    first.library.save('https://audio.example/long-set.mp3', 'Long set');
    await first.library.play();
    first.club.getPlaybackInfo = () => ({ seekable: true, position: 1834.5, duration: 7200, playing: false });
    assert.equal(first.library.capturePlayback(), true);

    const restored = libraryFixture(
        first.store.get('vrclub.questMusic'),
        '',
        first.store.get('vrclub.questMusicPlayback')
    );
    await restored.library.play();
    assert.equal(restored.plays[0][2].resumeAt, 1834.5);
    await restored.library.play();
    assert.equal(restored.plays[1][2].resumeAt, 0, 'the startup checkpoint must not re-seek every manual replay');

    restored.library.save('https://audio.example/different.mp3', 'Different');
    const different = libraryFixture(
        restored.store.get('vrclub.questMusic'),
        '',
        first.store.get('vrclub.questMusicPlayback')
    );
    await different.library.play();
    assert.equal(different.plays[0][2].resumeAt, 0, 'a different selected source inherited another set’s clock');
});

test('a corrupt playback checkpoint never hides or overwrites the saved music library', async () => {
    const saved = JSON.stringify({ items: [
        { url: 'https://audio.example/one.mp3', name: 'One' },
        { url: 'https://audio.example/two.mp3', name: 'Two' }
    ], selected: 1 });
    for (const playback of ['{invalid', JSON.stringify({ savedUrl: 'https://audio.example/two.mp3', position: -1, updatedAt: 1 })]) {
        const f = libraryFixture(saved, '', playback);
        assert.deepEqual(Array.from(f.library.items, item => item.name), ['One', 'Two']);
        assert.equal(f.library.current().name, 'Two');
        assert.equal(f.store.get('vrclub.questMusic'), saved);
        assert.ok(f.messages.some(message => typeof message === 'string' && /playback position/i.test(message)));
        await f.library.play();
        assert.equal(f.plays[0][2].resumeAt, 0);
        f.library.save('https://audio.example/three.mp3', 'Three');
        assert.deepEqual(JSON.parse(f.store.get('vrclub.questMusic')).items.map(item => item.name), ['One', 'Two', 'Three']);
    }
});

test('unreadable saved sets are preserved until retry or an explicit reset', () => {
    for (const raw of ['', '{invalid', '{"items":[{"url":"https://audio.example/good.mp3"},null]}']) {
        const f = libraryFixture(raw);
        assert.equal(f.library.readError, 'unreadable');
        assert.throws(() => f.library.save('https://audio.example/new.mp3'), /retry or reset/);
        assert.throws(() => f.library.replaceAll([]), /retry or reset/);
        assert.throws(() => f.library.replaceAll([{ url: 'https://audio.example/new.mp3' }]), /retry or reset/);
        assert.equal(f.store.get('vrclub.questMusic'), raw);
        assert.equal(f.library.retrySavedSets(), false);
        assert.equal(f.store.get('vrclub.questMusic'), raw);
    }
    const missing = libraryFixture();
    assert.equal(missing.library.readError, null);
    missing.library.save('https://audio.example/new.mp3');
    assert.equal(missing.library.items.length, 1);
});

test('saved-set retry handles unavailable storage and another tab without overwriting it', () => {
    const f = libraryFixture();
    const saved = JSON.stringify({ items: [{ url: 'https://audio.example/repaired.mp3', name: 'Repaired' }], selected: 0 });
    const denied = { getItem() { throw new Error('denied'); }, setItem() { assert.fail('must not write'); } };
    const unavailable = new f.library.constructor(f.club, denied);
    assert.equal(unavailable.readError, 'unavailable');
    assert.throws(() => unavailable.replaceAll([]), /retry or reset/);
    assert.throws(() => unavailable.resetUnreadableSets(), /Retry access/);
    denied.getItem = key => key === 'vrclub.questMusic' ? saved : null;
    assert.equal(unavailable.retrySavedSets(), true);
    assert.equal(unavailable.current().name, 'Repaired');

    const bad = libraryFixture('{invalid');
    bad.store.set('vrclub.questMusic', saved);
    assert.throws(() => bad.library.resetUnreadableSets(), /changed in another tab/);
    assert.equal(bad.store.get('vrclub.questMusic'), saved);
    assert.equal(bad.library.retrySavedSets(), true);
    assert.equal(bad.library.current().name, 'Repaired');
});

test('failed resets preserve unreadable bytes; successful resets cannot resume an old checkpoint', async () => {
    const checkpoint = JSON.stringify({ savedUrl: 'https://audio.example/old.mp3', position: 100, updatedAt: Date.now() + 100000 });
    const f = libraryFixture('{invalid', '', checkpoint);
    f.storage.setItem = () => { throw new Error('quota'); };
    assert.throws(() => f.library.resetUnreadableSets(), /Could not reset/);
    assert.equal(f.store.get('vrclub.questMusic'), '{invalid');
    assert.equal(f.library.readError, 'unreadable');
    f.storage.setItem = (key, value) => f.store.set(key, value);
    f.library.resetUnreadableSets();
    f.library.save('https://audio.example/old.mp3', 'Old');
    const restored = libraryFixture(f.store.get('vrclub.questMusic'), '', checkpoint);
    await restored.library.play();
    assert.equal(restored.plays[0][2].resumeAt, 0);
    await f.library.play();
    f.club.getPlaybackInfo = () => ({ seekable: true, position: 120, duration: 3600, playing: true });
    assert.equal(f.library.capturePlayback(), true);
    const fresh = libraryFixture(f.store.get('vrclub.questMusic'), '', f.store.get('vrclub.questMusicPlayback'));
    await fresh.library.play();
    assert.equal(fresh.plays[0][2].resumeAt, 120);
});

test('Miss Melera SoundCloud links resolve to the main-branch relay audio stream', async () => {
    const feed = `<?xml version="1.0"?><rss><channel><item>
        <title>Colourizon 168</title>
        <enclosure type="audio/mpeg" url="https://vrclub-network.garfieldapp.workers.dev/podcast/colourizon/stream/2407530030-missmelera-miss-melera-colourizon-168.mp3"/>
    </item></channel></rss>`;
    const f = libraryFixture(null, feed);
    f.library.save('https://soundcloud.com/missmelera/colourizon-168?si=tracking', 'Colourizon 168');
    assert.equal(await f.library.play(), true);
    assert.equal(f.plays[0][0], 'direct');
    assert.equal(
        f.plays[0][1],
        'https://vrclub-network.garfieldapp.workers.dev/podcast/colourizon/stream/2407530030-missmelera-miss-melera-colourizon-168.mp3'
    );
    assert.equal(f.plays[0][2].onDemand, true);
    assert.equal(f.fetches[0][0], 'https://vrclub-network.garfieldapp.workers.dev/podcast/colourizon/feed.xml');
    assert.equal(f.library.matchesPlaybackUrl(
        'https://soundcloud.com/missmelera/colourizon-168',
        f.plays[0][1]
    ), true);
    assert.equal(f.club.nowPlayingLabel, 'Colourizon 168');
});

test('any SoundCloud track the creator shares with podcast players plays as analysed audio through the relay', async () => {
    const f = libraryFixture(null, url => url.includes('/soundcloud/resolve')
        ? JSON.stringify({ name: '42-some-dj-summer-mix.mp3', title: 'Summer Mix by Some DJ', path: '/soundcloud/stream/42-some-dj-summer-mix.mp3' })
        : new Error('unexpected'));
    f.library.save('https://soundcloud.com/some-dj/summer-mix?si=tracking');
    assert.equal(await f.library.play(), true);
    assert.equal(f.plays[0][0], 'direct', 'never SoundCloud\'s own player');
    assert.equal(f.plays[0][1], 'https://vrclub-network.garfieldapp.workers.dev/soundcloud/stream/42-some-dj-summer-mix.mp3');
    assert.equal(f.plays[0][2].onDemand, true);
    assert.equal(f.fetches[0][0],
        'https://vrclub-network.garfieldapp.workers.dev/soundcloud/resolve?url=' + encodeURIComponent('https://soundcloud.com/some-dj/summer-mix'));
    assert.equal(f.club.nowPlayingLabel, 'Summer Mix by Some DJ');
    assert.equal(f.library.current().name, 'Summer Mix by Some DJ', 'an unnamed set takes the track title');
    assert.equal(f.library.matchesPlaybackUrl('https://soundcloud.com/some-dj/summer-mix', f.plays[0][1]), true);
    assert.equal(f.plays.some(play => play[0] === 'soundcloud'), false);
});

test('the SoundCloud app\u2019s share link (on.soundcloud.com/<id>) is saved without tracking and played through the relay', async () => {
    const f = libraryFixture(null, url => url.includes('/soundcloud/resolve')
        ? JSON.stringify({ name: '77-missmelera-miss-melera-colourizon-168.mp3', title: 'Colourizon 168', path: '/soundcloud/stream/77-missmelera-miss-melera-colourizon-168.mp3' })
        : new Error('unexpected'));
    const item = f.library.save('https://on.soundcloud.com/NnMSCRNn9Rf5sN25hr?si=tracking&utm_source=mobi', 'Melera set');
    assert.equal(item.kind, 'soundcloud');
    assert.equal(item.url, 'https://on.soundcloud.com/NnMSCRNn9Rf5sN25hr');
    assert.equal(await f.library.play(), true);
    assert.equal(f.plays[0][0], 'direct', 'analysed audio, not SoundCloud\u2019s own player');
    assert.equal(f.plays[0][1], 'https://vrclub-network.garfieldapp.workers.dev/soundcloud/stream/77-missmelera-miss-melera-colourizon-168.mp3');
    assert.equal(f.fetches[0][0],
        'https://vrclub-network.garfieldapp.workers.dev/soundcloud/resolve?url=' + encodeURIComponent('https://on.soundcloud.com/NnMSCRNn9Rf5sN25hr'),
        'the relay expands the share link: a browser cannot follow its cross-origin redirect');
});

test('the club\u2019s own set fills silence: it loops, is never saved, and never plays over a guest\u2019s music or a host\u2019s room', async () => {
    const quiet = f => { f.club.getPlaybackInfo = () => ({ seekable: false, position: 0, duration: 0, playing: false }); return f; };

    // Nothing saved, nothing playing: it starts, from this site's own origin, and loops (no onDemand).
    const f = quiet(libraryFixture());
    assert.equal(await f.library.playDefault(), true);
    assert.deepEqual([f.plays[0][0], f.plays[0][1]], ['direct', 'https://club.example/audio/nocturne-house.mp3']);
    assert.deepEqual({ ...f.plays[0][2] }, { quietBlock: true }, 'a default set loops (no onDemand) and a blocked autoplay is quiet: the first gesture retries it');
    assert.equal(f.club.nowPlayingLabel, 'NOCTURNE House (club set)');
    assert.equal(f.library.items.length, 0, 'it is never added to the guest\u2019s list');
    assert.equal(f.store.get('vrclub.questMusic'), undefined, 'and nothing is written to storage');
    f.club._audioKind = 'stream';
    f.club._audioStreamUrl = f.plays[0][1];
    assert.equal(f.library.isDefaultPlaying(), true);

    // A browser that held the sound back leaves it loaded but not playing: the next gesture may retry it.
    assert.equal(await f.library.playDefault(), true);
    assert.equal(f.plays.length, 2);

    // A guest with saved sets plays their own (that is startEntryMusic's other branch), never the default.
    const saved = quiet(libraryFixture());
    saved.library.save('https://audio.example/mine.mp3', 'Mine');
    assert.equal(await saved.library.playDefault(), false);
    assert.equal(saved.plays.length, 0);

    // Someone else's room: the host owns the music.
    const room = quiet(libraryFixture());
    room.club.isFollowingHost = () => true;
    assert.equal(await room.library.playDefault(), false);
    assert.equal(room.plays.length, 0);

    // Something is already playing, or something else is loaded (a local file, SoundCloud's own player).
    const playing = libraryFixture();
    assert.equal(await playing.library.playDefault(), false);
    for (const kind of ['file', 'soundcloud']) {
        const other = quiet(libraryFixture());
        other.club._audioKind = kind;
        assert.equal(await other.library.playDefault(), false, kind);
        assert.equal(other.plays.length, 0);
    }
    const another = quiet(libraryFixture());
    another.club._audioKind = 'stream';
    another.club._audioStreamUrl = 'https://audio.example/other.mp3';
    assert.equal(await another.library.playDefault(), false, 'another stream is left alone');
    assert.equal(another.library.isDefaultPlaying(), false);
});

test('the club set ships: a real MP3 under the Pages limit, copied by the build, registered in ASSETS.md and not cached by the service worker', () => {
    const file = path.join(root, 'audio', 'nocturne-house.mp3');
    const bytes = readFileSync(file);
    assert.ok(bytes.length > 10 * 1048576 && bytes.length < 25 * 1048576, `${bytes.length} bytes must be 10-25 MiB (Cloudflare Pages limit)`);
    const hasId3 = bytes.subarray(0, 3).toString('latin1') === 'ID3';
    const sync = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    assert.ok(hasId3 || sync, 'it starts like an MP3');
    assert.match(readFileSync(path.join(root, 'scripts', 'build.mjs'), 'utf8'), /cp\(path\.join\(root, 'audio'\), path\.join\(dist, 'audio'\)/);
    assert.match(readFileSync(path.join(root, 'ASSETS.md'), 'utf8'), /audio\/nocturne-house\.mp3[\s\S]*original work of this project/);
    assert.match(readFileSync(path.join(root, '_headers'), 'utf8'), /\/audio\/\*\n\s+Cache-Control: no-cache/);
    assert.doesNotMatch(readFileSync(path.join(root, 'sw.js'), 'utf8'), /nocturne-house|\.mp3/, 'the 19 MiB set is never precached');
    assert.match(readFileSync(path.join(root, 'scripts', 'build-default-set.mjs'), 'utf8'), /25 \* 1048576/, 'the generator refuses an oversized file');
    // Entry music uses it only when nothing is saved.
    const ui = readFileSync(path.join(root, 'js', 'ui-init.js'), 'utf8');
    assert.match(ui, /if \(!item\) \{[\s\S]*library\.playDefault\(\)/);
});

test('a SoundCloud track that is not shared for analysis fails clearly and never opens the player on its own', async () => {
    const notShared = libraryFixture(null, () => new Error('HTTP 404 Not Found for relay'));
    notShared.library.save('https://soundcloud.com/some-dj/private-mix', 'My mix');
    await assert.rejects(notShared.library.play(), error => error.code === 'soundcloud-not-published' && /podcast players/.test(error.message));
    const defaultOnly = f => f.plays.every(play => play[0] === 'direct' && play[1] === 'https://club.example/audio/nocturne-house.mp3');
    assert.ok(defaultOnly(notShared) && !notShared.plays.some(play => play[0] === 'soundcloud'), 'no automatic fallback to the embedded player: only the club\u2019s own set steps in');
    assert.equal(notShared.library.current().name, 'My mix', 'the saved set is kept');
    // The embedded player is only ever the guest's explicit choice.
    assert.equal(await notShared.library.playInSoundCloudPlayer(), true);
    assert.deepEqual(notShared.plays.at(-1).slice(0, 3), ['soundcloud', 'https://soundcloud.com/some-dj/private-mix', 'My mix']);
    assert.equal(notShared.library.lastMode, 'player');

    const playlist = libraryFixture(null, () => new Error('HTTP 400 Bad Request for relay'));
    playlist.library.save('https://soundcloud.com/some-dj/sets/summer');
    await assert.rejects(playlist.library.play(), error => error.code === 'soundcloud-not-a-track');

    const offline = libraryFixture(null, () => new Error('network down'));
    offline.library.save('https://soundcloud.com/some-dj/summer-mix');
    await assert.rejects(offline.library.play(), error => error.code === 'soundcloud-relay');
    assert.ok(defaultOnly(offline));
});

test('a Miss Melera page is found in the relay feed by permalink or by Colourizon number', async () => {
    const feed = `<rss><channel><item><title>Colourizon 168</title>
        <enclosure type="audio/mpeg" url="https://relay.example/podcast/colourizon/stream/2407530030-missmelera-miss-melera-colourizon-168.mp3"/></item></channel></rss>`;
    for (const page of ['miss-melera-colourizon-168', 'colourizon-168', 'miss-melera-colourizon-168-sept-2026']) {
        const f = libraryFixture(null, feed);
        f.library.save(`https://soundcloud.com/missmelera/${page}`);
        assert.equal(await f.library.play(), true, page);
        assert.equal(f.plays[0][0], 'direct');
        assert.match(f.plays[0][1], /2407530030-missmelera-miss-melera-colourizon-168\.mp3$/);
        assert.equal(f.fetches.length, 1, 'her own feed answers without the generic resolver');
    }
    // Not in her feed: the generic resolver is asked, and its refusal is explicit.
    const other = libraryFixture(null, url => url.endsWith('feed.xml') ? '<rss/>' : new Error('HTTP 404 Not Found'));
    other.library.save('https://soundcloud.com/missmelera/colourizon-999');
    await assert.rejects(other.library.play(), error => error.code === 'soundcloud-not-published');
    assert.ok(other.plays.every(play => play[1] === 'https://club.example/audio/nocturne-house.mp3'), 'only the club\u2019s own set steps in');
});

test('a Hernan Cattaneo / RSS feed URL is saved and plays its newest episode', async () => {
    const feed = `<rss><channel>
        <item><title>Resident 999</title><enclosure type="audio/mpeg" url="https://mcdn.podbean.com/newest.mp3"/></item>
        <item><title>Resident 998</title><enclosure type="audio/mpeg" url="https://mcdn.podbean.com/older.mp3"/></item>
    </channel></rss>`;
    const f = libraryFixture(null, feed);
    f.library.save('https://podcast.hernancattaneo.com/feed.xml');
    assert.equal(f.library.items.length, 1, 'the URL is kept in the saved sets');
    assert.equal(f.library.current().name, 'Resident by Hernan Cattaneo');
    assert.equal(await f.library.play(), true);
    assert.equal(f.plays[0][1], 'https://mcdn.podbean.com/newest.mp3');
    assert.equal(f.club.nowPlayingLabel, 'Resident 999');
    assert.equal(f.fetches[0][0], 'https://podcast.hernancattaneo.com/feed.xml');
    assert.equal(f.fetches[0][1].headers.Range, 'bytes=0-65535', 'the big Resident feed is read by range first');
    assert.equal(f.library.matchesPlaybackUrl('https://podcast.hernancattaneo.com/feed.xml', 'https://mcdn.podbean.com/newest.mp3'), true);
    const empty = libraryFixture(null, '<rss/>');
    empty.library.save('https://podcast.hernancattaneo.com/feed.xml');
    await assert.rejects(empty.library.play(), /No playable episode/);
});

test('any Hernan Cattaneo episode can be listed, chosen, remembered and played (or a random one)', async () => {
    const feed = `<rss><channel>
        <item><title>Resident 999</title><enclosure type="audio/mpeg" url="https://mcdn.podbean.com/newest.mp3"/></item>
        <item><title>Resident 998</title><enclosure type="audio/mpeg" url="https://mcdn.podbean.com/older.mp3"/></item>
        <item><title>Resident 997</title><enclosure type="audio/mpeg" url="https://mcdn.podbean.com/oldest.mp3"/></item>
    </channel></rss>`;
    const f = libraryFixture(null, feed);
    f.library.save('https://podcast.hernancattaneo.com/feed.xml');
    const episodes = await f.library.listEpisodes();
    assert.equal(JSON.stringify(episodes.map(episode => episode.title)), JSON.stringify(['Resident 999', 'Resident 998', 'Resident 997']));
    assert.equal(f.fetches.at(-1)[1].headers, undefined, 'listing reads the whole feed, not just its head');

    f.library.setEpisode(episodes[2]);
    assert.equal(await f.library.play(), true);
    assert.equal(f.plays.at(-1)[1], 'https://mcdn.podbean.com/oldest.mp3');
    assert.equal(f.club.nowPlayingLabel, 'Resident 997');
    // The choice survives a reload and a repeated "Save & play" of the same URL.
    f.library.save('https://podcast.hernancattaneo.com/feed.xml');
    const restored = libraryFixture(f.store.get('vrclub.questMusic'), feed).library;
    assert.equal(restored.current().episode.url, 'https://mcdn.podbean.com/oldest.mp3');

    f.library.setEpisode(null);
    await f.library.play();
    assert.equal(f.plays.at(-1)[1], 'https://mcdn.podbean.com/newest.mp3', 'no choice means the newest episode');

    f.library.setEpisode('random');
    const seen = new Set();
    for (let i = 0; i < 40; i++) { await f.library.play(); seen.add(f.plays.at(-1)[1]); }
    assert.ok(seen.size > 1 && [...seen].every(url => url.startsWith('https://mcdn.podbean.com/')), 'random picks different episodes of the feed');

    assert.throws(() => libraryFixture().library.setEpisode('random'), /podcast feed/);
    assert.equal(libraryFixture().library.save('https://audio.example/a.mp3').episode, undefined);
});

test('every host the Music code reads from the browser is allowed by the page CSP', () => {
    const html = readFileSync(path.join(root, 'index.html'), 'utf8');
    const connect = /connect-src([^;]*);/.exec(html.match(/http-equiv="Content-Security-Policy"\s+content="([^"]+)"/s)[1])[1];
    const feed = /RESIDENT_FEED = '(https:\/\/[^/']+)/.exec(source)[1];
    assert.ok(connect.includes(feed), `connect-src must allow ${feed} (the Resident feed) or Hernan sets never load`);
    assert.ok(connect.includes('https://vrclub-network.garfieldapp.workers.dev'), 'connect-src must allow the relay that resolves SoundCloud and Colourizon');
    assert.ok(/ws:/.test(connect), 'a self-hosted relay address needs ws:/wss:');
});

const options = {
    url: 'https://club.example/nocturne/', packageId: 'com.example.nocturne', appId: '123456789',
    fingerprint: Array(32).fill('AB').join(':'), keystore: path.resolve(root, '..', 'private-signing', 'quest.keystore'),
    alias: 'nocturne', versionCode: '2'
};

test('Quest wrapper configuration preserves subdirectory URLs and uses the setup panel', () => {
    const config = questConfiguration(options, '1.1.0');
    assert.equal(config.manifest.horizonOSAppMode, '2D');
    assert.equal(config.manifest.isMetaQuest, true);
    assert.equal(config.manifest.applicationId, options.appId);
    assert.equal(config.manifest.startUrl, '/nocturne/');
    assert.equal(config.manifest.webManifestUrl, `${options.url}manifest.json`);
    assert.equal(config.manifest.appVersionCode, 2);
    assert.equal(config.manifest.fingerprints[0].value, options.fingerprint);
    assert.equal(config.assetlinks[0].target.package_name, options.packageId);
    assert.deepEqual(config.assetlinks[0].target.sha256_cert_fingerprints, [options.fingerprint]);
    assert.doesNotMatch(JSON.stringify(config), /password/i);
});

test('Quest packaging rejects incomplete identity, insecure URLs and in-tree signing keys', () => {
    for (const change of [
        { url: undefined }, { url: 'http://club.example/' }, { url: 'https://localhost/' },
        { url: 'https://127.0.0.1/' }, { url: 'https://[::1]/' }, { url: 'https://club.local/' },
        { url: 'https://club.example/nocturne' }, { url: 'https://user:pass@club.example/' },
        { url: 'https://club.example/?secret=1' }, { packageId: 'not-a-package' },
        { appId: 'YOUR_APP_ID' }, { fingerprint: 'AB:CD' }, { alias: '' },
        { keystore: path.join(root, 'quest.keystore') }, { keystore: 'relative.keystore' },
        { versionCode: '1.5' }, { versionCode: '-1' }, { versionCode: 0 }, { versionCode: '2100000001' }
    ]) assert.throws(() => questConfiguration({ ...options, ...change }, '1.1.0'));
});

test('the generated manifest carries every field the Bubblewrap template renders, so the Gradle file compiles', () => {
    const manifest = questConfiguration(options, '1.1.0').manifest;
    assert.equal(manifest.enableNotifications, false);
    assert.equal(manifest.splashScreenFadeOutDuration, 300);
    assert.equal(manifest.appVersion, '1.1.0');
    assert.equal(manifest.appVersionName, '1.1.0');
});

test('a two-segment package id such as nocturne.vrnightclub is accepted; one segment or a bad character is not', () => {
    const manifest = questConfiguration({ ...options, packageId: 'nocturne.vrnightclub' }, '1.1.0');
    assert.equal(manifest.manifest.packageId, 'nocturne.vrnightclub');
    assert.equal(manifest.assetlinks[0].target.package_name, 'nocturne.vrnightclub');
    for (const packageId of ['nocturne', 'nocturne.', '.nocturne.vr', 'Nocturne.vr', 'nocturne.1vr', 'nocturne.vr-club']) {
        assert.throws(() => questConfiguration({ ...options, packageId }, '1.1.0'), /package id/);
    }
});

test('Quest packaging rejects an unknown target or mode', () => {
    for (const change of [{ target: 'playstore' }, { mode: 'vr' }]) {
        assert.throws(() => questConfiguration({ ...options, ...change }, '1.1.0'));
    }
});

test('the immersive app starts the club in VR through ?immersive=1; the setup-panel app does not', () => {
    const immersive = questConfiguration({ ...options, mode: 'immersive' }, '1.1.0').manifest;
    assert.equal(immersive.horizonOSAppMode, 'immersive');
    assert.equal(immersive.startUrl, '/nocturne/?immersive=1');
    const home = questConfiguration({ ...options, url: 'https://club.example/', mode: 'immersive' }, '1.1.0').manifest;
    assert.equal(home.startUrl, '/?immersive=1');
    assert.equal(questConfiguration(options, '1.1.0').manifest.startUrl, '/nocturne/');
});

test('a SideQuest build needs no Meta App ID and carries none; a Meta build still requires one', () => {
    const withoutAppId = { ...options, appId: undefined };
    const sideQuest = questConfiguration({ ...withoutAppId, target: 'sidequest', mode: 'immersive' }, '1.1.0').manifest;
    assert.equal('applicationId' in sideQuest, false);
    assert.equal(sideQuest.packageId, options.packageId);
    assert.throws(() => questConfiguration({ ...withoutAppId, target: 'meta' }, '1.1.0'), /App ID/);
    assert.throws(() => questConfiguration(withoutAppId, '1.1.0'), /App ID/);
});

test('the certificate fingerprint is read from keytool output', () => {
    const fingerprint = Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0').toUpperCase()).join(':');
    const output = `Alias name: nocturne\nCertificate fingerprints:\n\t SHA1: 11:22\n\t SHA256: ${fingerprint.toLowerCase()}\n`;
    assert.equal(parseKeytoolFingerprint(output), fingerprint);
    assert.equal(parseKeytoolFingerprint('keytool error: Keystore was tampered with'), null);
    assert.equal(parseKeytoolFingerprint('SHA256: AB:CD'), null);
});

test('Quest entry references no catalogue, artist DJs or Mixamo model files', () => {
    const html = readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /src="js\/musicLibrary\.js/);
    // No catalogue script or preselected feed: the only mention allowed is the CSP's connect-src host for the Resident
    // feed, which the guest's own pasted link needs.
    assert.doesNotMatch(html, /src="js\/podcasts\.js|feeds\.soundcloud/);
    const withoutCsp = html.replace(/<meta http-equiv="Content-Security-Policy"[^>]*>/s, '').replace(/<!--[\s\S]*?-->/g, '');
    assert.doesNotMatch(withoutCsp, /podcast\.hernancattaneo/);
    const crowd = readFileSync(path.join(root, 'js', 'club', '11-audio-crowd.js'), 'utf8');
    assert.doesNotMatch(crowd, /js\/models\/avatars\/(?:Hip Hop Dancing|house|rumba_dancing_female_character)\.glb/);
    assert.doesNotMatch(crowd, /['"][^'"]*(?:hip_hop|rumba_danc|house_danc|club-dj-hernan|club-dj-melera)[^'"]*\.glb['"]/i);
    assert.match(crowd, /club-dj-male\.glb/);
    assert.match(crowd, /club-dj-female\.glb/);
    for (const name of ['babylon-apache-2.0.txt', 'cc-by-4.0.txt', 'cc0-1.0.txt', 'THIRD-PARTY-NOTICES.txt']) {
        assert.ok(readFileSync(path.join(root, 'licenses', name), 'utf8').length > 100);
    }
});
