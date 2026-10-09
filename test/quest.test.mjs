import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { questConfiguration } from '../scripts/prepare-quest.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(path.join(root, 'js', 'musicLibrary.js'), 'utf8');

function libraryFixture(raw = null) {
    const messages = [], plays = [];
    const store = new Map(raw ? [['vrclub.questMusic', raw]] : []);
    const storage = { getItem: key => store.get(key) || null, setItem: (key, value) => store.set(key, value) };
    const context = vm.createContext({ URL, window: {}, console: { warn: (...args) => messages.push(args) } });
    vm.runInContext(source, context);
    const club = {
        showErrorMessage: message => messages.push(message),
        guardHostControl: () => true,
        startAudioStream: async (...args) => plays.push(['direct', ...args]),
        startSoundCloud: async (...args) => plays.push(['soundcloud', ...args])
    };
    return { library: new context.window.MusicLibrary(club, storage), club, storage, store, messages, plays };
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

test('SoundCloud page links use its official player instead of the direct audio graph', async () => {
    const f = libraryFixture();
    f.library.save('https://soundcloud.com/missmelera/colourizon-168?si=tracking', 'Colourizon 168');
    assert.equal(await f.library.play(), true);
    assert.deepEqual(f.plays[0].slice(0, 3), [
        'soundcloud', 'https://soundcloud.com/missmelera/colourizon-168', 'Colourizon 168'
    ]);
    assert.equal(f.club.nowPlayingLabel, 'Colourizon 168');
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
