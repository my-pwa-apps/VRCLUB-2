import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { questConfiguration } from '../scripts/prepare-quest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'js', 'musicLibrary.js'), 'utf8');
const audioUtilsSource = readFileSync(path.join(root, 'js', 'audioUtils.js'), 'utf8');

function libraryFixture(raw = null, feed = '') {
    const messages = [], plays = [];
    const store = new Map(raw ? [['vrclub.questMusic', raw]] : []);
    const storage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
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
        startAudioStream: async (...args) => plays.push(['direct', ...args]),
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
        'https://feeds.example/show/feed',
        'https://feeds.example/show.rss',
    ]) {
        assert.equal(kind(url), 'feed', url);
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

test('a SoundCloud track that is not shared for analysis fails clearly and never opens the player on its own', async () => {
    const notShared = libraryFixture(null, () => new Error('HTTP 404 Not Found for relay'));
    notShared.library.save('https://soundcloud.com/some-dj/private-mix', 'My mix');
    await assert.rejects(notShared.library.play(), error => error.code === 'soundcloud-not-published' && /podcast players/.test(error.message));
    assert.equal(notShared.plays.length, 0, 'no automatic fallback to the embedded player');
    assert.equal(notShared.library.current().name, 'My mix', 'the saved set is kept');
    // The embedded player is only ever the guest's explicit choice.
    assert.equal(await notShared.library.playInSoundCloudPlayer(), true);
    assert.deepEqual(notShared.plays[0].slice(0, 3), ['soundcloud', 'https://soundcloud.com/some-dj/private-mix', 'My mix']);
    assert.equal(notShared.library.lastMode, 'player');

    const playlist = libraryFixture(null, () => new Error('HTTP 400 Bad Request for relay'));
    playlist.library.save('https://soundcloud.com/some-dj/sets/summer');
    await assert.rejects(playlist.library.play(), error => error.code === 'soundcloud-not-a-track');

    const offline = libraryFixture(null, () => new Error('network down'));
    offline.library.save('https://soundcloud.com/some-dj/summer-mix');
    await assert.rejects(offline.library.play(), error => error.code === 'soundcloud-relay');
    assert.equal(offline.plays.length, 0);
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
    assert.equal(other.plays.length, 0);
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
    empty.library.save('https://feeds.example/empty.rss');
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

test('Quest entry references no catalogue, artist DJs or Mixamo model files', () => {
    const html = readFileSync(path.join(root, 'index.html'), 'utf8');
    assert.match(html, /src="js\/musicLibrary\.js/);
    assert.doesNotMatch(html, /src="js\/podcasts\.js|podcast\.hernancattaneo|feeds\.soundcloud/);
    const crowd = readFileSync(path.join(root, 'js', 'club', '11-audio-crowd.js'), 'utf8');
    assert.doesNotMatch(crowd, /js\/models\/avatars\/(?:Hip Hop Dancing|house|rumba_dancing_female_character)\.glb/);
    assert.doesNotMatch(crowd, /['"][^'"]*(?:hip_hop|rumba_danc|house_danc|club-dj-hernan|club-dj-melera)[^'"]*\.glb['"]/i);
    assert.match(crowd, /club-dj-male\.glb/);
    assert.match(crowd, /club-dj-female\.glb/);
    for (const name of ['babylon-apache-2.0.txt', 'cc-by-4.0.txt', 'cc0-1.0.txt', 'THIRD-PARTY-NOTICES.txt']) {
        assert.ok(readFileSync(path.join(root, 'licenses', name), 'utf8').length > 100);
    }
});
