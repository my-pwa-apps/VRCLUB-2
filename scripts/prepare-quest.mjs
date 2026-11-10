import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isIP } from 'node:net';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function questConfiguration(options, version) {
    if (!options.url) throw new Error('Supply the permanent public HTTPS deployment URL with --url.');
    const url = new URL(options.url);
    const hostname = url.hostname.replace(/^\[|\]$/g, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        isIP(hostname) || !hostname.includes('.') || hostname.endsWith('.localhost') || hostname.endsWith('.local')) {
        throw new Error('Use the permanent public HTTPS deployment URL, without credentials, query or fragment.');
    }
    if (!url.pathname.endsWith('/')) throw new Error('The deployment URL must end with / (including any subdirectory).');
    if (!/^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*){2,}$/.test(options.packageId || '')) {
        throw new Error('Supply a permanent Android package id, for example com.yourcompany.nocturne.');
    }
    if (!/^[1-9]\d*$/.test(options.appId || '')) throw new Error('Supply your real numeric Meta Horizon App ID.');
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
            packageId: options.packageId, applicationId: options.appId,
            host: url.host, name: 'NOCTURNE - Your Virtual Nightclub', launcherName: 'NOCTURNE',
            display: 'standalone', orientation: 'any',
            themeColor: '#030308', backgroundColor: '#030308', startUrl: url.pathname,
            iconUrl: new URL('icons/icon-512.png', url).href,
            maskableIconUrl: new URL('icons/icon-maskable-512.png', url).href,
            webManifestUrl: new URL('manifest.json', url).href,
            signingKey: { path: options.keystore, alias: options.alias },
            appVersion: String(versionCode), appVersionName: version, appVersionCode: versionCode,
            fallbackType: 'customtabs', features: {},
            isMetaQuest: true, horizonOSAppMode: '2D',
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

async function main() {
    const names = {
        '--url': 'url', '--package-id': 'packageId', '--app-id': 'appId',
        '--fingerprint': 'fingerprint', '--keystore': 'keystore', '--alias': 'alias',
        '--version-code': 'versionCode'
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
    const { version } = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
    const config = questConfiguration(options, version);
    await readFile(options.keystore); // Fail before generating configuration for a missing signing key.
    const out = path.join(ROOT, 'quest-package');
    await mkdir(out, { recursive: true });
    await writeFile(path.join(out, 'twa-manifest.json'), JSON.stringify(config.manifest, null, 2) + '\n');
    await writeFile(path.join(out, 'assetlinks.json'), JSON.stringify(config.assetlinks, null, 2) + '\n');
    console.log('Prepared quest-package/twa-manifest.json and assetlinks.json. No APK was built or uploaded.');
    console.log('Run npm run build:quest, deploy dist/, and publish .well-known/assetlinks.json at the ORIGIN ROOT.');
    console.log('Then use Meta Bubblewrap update/build from quest-package. See docs/QUEST.md.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => {
        console.error(`Quest preparation failed: ${error.message}`);
        process.exitCode = 1;
    });
}
