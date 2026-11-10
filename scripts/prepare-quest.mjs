import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const QUEST_TARGETS = ['meta', 'sidequest'];
export const QUEST_MODES = ['2D', 'immersive'];

/** The SHA-256 certificate fingerprint from `keytool -list -v` output (colon-separated hex), or null. */
export function parseKeytoolFingerprint(output) {
    const match = /SHA-?256:\s*((?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2})/.exec(String(output));
    return match ? match[1].toUpperCase() : null;
}

export function questConfiguration(options, version) {
    if (!options.url) throw new Error('Supply the permanent public HTTPS deployment URL with --url.');
    const target = options.target ?? 'meta';
    const mode = options.mode ?? '2D';
    if (!QUEST_TARGETS.includes(target)) throw new Error(`--target must be one of: ${QUEST_TARGETS.join(', ')}.`);
    if (!QUEST_MODES.includes(mode)) throw new Error(`--mode must be one of: ${QUEST_MODES.join(', ')}.`);
    const url = new URL(options.url);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        isIP(hostname) || !hostname.includes('.') || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
        throw new Error('Use the permanent public HTTPS deployment URL, without credentials, query or fragment.');
    }
    if (!url.pathname.endsWith('/')) throw new Error('The deployment URL must end with / (including any subdirectory).');
    // Android requires at least two dot-separated segments.
    if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+$/.test(options.packageId || '')) {
        throw new Error('Supply a permanent Android package id, for example nocturne.vrnightclub.');
    }
    // A SideQuest build is never entitled by Meta, so it has no Horizon App ID to carry.
    if (target === 'meta' && !/^[1-9]\d*$/.test(options.appId || '')) throw new Error('Supply your real numeric Meta Horizon App ID.');
    if (!/^(?:[A-Fa-f0-9]{2}:){31}[A-Fa-f0-9]{2}$/.test(options.fingerprint || '')) {
        throw new Error('Supply the signing certificate SHA-256 fingerprint (32 colon-separated hex pairs).');
    }
    if (!options.keystore || !path.isAbsolute(options.keystore) || !options.alias) {
        throw new Error('Supply the absolute signing keystore path and its alias. Do not put passwords in arguments.');
    }
    const relativeKey = path.relative(ROOT, options.keystore);
    if (!relativeKey.startsWith(`..${path.sep}`) && !path.isAbsolute(relativeKey)) {
        throw new Error('Keep the signing keystore outside the repository and deployable web tree.');
    }
    const versionCode = Number(options.versionCode ?? 1);
    if (!Number.isSafeInteger(versionCode) || versionCode < 1 || versionCode > 2100000000) {
        throw new Error('Version code must be an integer from 1 to 2100000000.');
    }
    const fingerprint = options.fingerprint.toUpperCase();
    return {
        manifest: {
            packageId: options.packageId, ...(target === 'meta' ? { applicationId: options.appId } : {}),
            host: url.host, name: 'NOCTURNE - Your Virtual Nightclub', launcherName: 'NOCTURNE',
            display: 'standalone', orientation: 'any',
            themeColor: '#030308', backgroundColor: '#030308',
            // The immersive app has no 2D page: this query makes the club start its own VR session (js/immersiveLaunch.js).
            startUrl: mode === 'immersive' ? `${url.pathname}?immersive=1` : url.pathname,
            iconUrl: new URL('icons/icon-512.png', url).href,
            maskableIconUrl: new URL('icons/icon-maskable-512.png', url).href,
            webManifestUrl: new URL('manifest.json', url).href,
            signingKey: { path: options.keystore, alias: options.alias },
            appVersion: version, appVersionName: version, appVersionCode: versionCode,
            fallbackType: 'customtabs', features: {},
            // Meta's Bubblewrap template renders these as bare values: left unset, the generated Gradle file does not compile.
            enableNotifications: false, splashScreenFadeOutDuration: 300, enableSiteSettingsShortcut: true,
            shortcuts: [], isChromeOSOnly: false,
            isMetaQuest: true, horizonOSAppMode: mode,
            fingerprints: [{ value: fingerprint }], minSdkVersion: 23
        },
        assetlinks: [{
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
                namespace: 'android_app', package_name: options.packageId,
                sha256_cert_fingerprints: [fingerprint]
            }
        }]
    };
}

/** Reads the certificate fingerprint from the keystore with keytool; the password comes from the environment only. */
function keystoreFingerprint(keystore, alias) {
    if (!process.env.BUBBLEWRAP_KEYSTORE_PASSWORD) {
        throw new Error('Set BUBBLEWRAP_KEYSTORE_PASSWORD in this shell (or pass --fingerprint) so the fingerprint can be read.');
    }
    const result = spawnSync('keytool', ['-list', '-v', '-keystore', keystore, '-alias', alias, '-storepass:env', 'BUBBLEWRAP_KEYSTORE_PASSWORD'],
        { encoding: 'utf8' });
    if (result.error) throw new Error('keytool was not found. Install a JDK (see docs/QUEST.md) or pass --fingerprint.');
    const fingerprint = parseKeytoolFingerprint(result.stdout);
    if (!fingerprint) throw new Error('keytool could not read the keystore: check the path, alias and BUBBLEWRAP_KEYSTORE_PASSWORD.');
    return fingerprint;
}

async function main() {
    const names = {
        '--url': 'url', '--package-id': 'packageId', '--app-id': 'appId',
        '--fingerprint': 'fingerprint', '--keystore': 'keystore', '--alias': 'alias',
        '--version-code': 'versionCode', '--target': 'target', '--mode': 'mode'
    };
    const options = {};
    const args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
        const name = names[args[i]];
        if (!name || !args[i + 1] || args[i + 1].startsWith('--')) {
            throw new Error('See docs/QUEST.md for the required quest:prepare arguments.');
        }
        options[name] = args[i + 1];
    }
    if (!options.keystore || !options.alias) throw new Error('Supply --keystore (absolute path) and --alias. See docs/QUEST.md.');
    await readFile(options.keystore); // Fail before generating configuration for a missing signing key.
    if (!options.fingerprint) options.fingerprint = keystoreFingerprint(options.keystore, options.alias);
    const { version } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
    const config = questConfiguration(options, version);
    const out = path.join(ROOT, 'quest-package');
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, 'twa-manifest.json'), JSON.stringify(config.manifest, null, 2) + '\n');
    await writeFile(path.join(out, 'assetlinks.json'), JSON.stringify(config.assetlinks, null, 2) + '\n');
    console.log(`Prepared quest-package/twa-manifest.json and assetlinks.json (${options.target ?? 'meta'}, ${options.mode ?? '2D'}). No APK was built or uploaded.`);
    console.log(`Certificate fingerprint: ${config.manifest.fingerprints[0].value}`);
    console.log('Run npm run build:quest, deploy dist/, and publish .well-known/assetlinks.json at the ORIGIN ROOT.');
    console.log('Then use Meta Bubblewrap update/build from quest-package. See docs/QUEST.md.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => {
        console.error(`Quest preparation failed: ${error.message}`);
        process.exitCode = 1;
    });
}
