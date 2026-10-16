import { existsSync } from 'node:fs';
import { copyFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Builds the signed APK from quest-package/twa-manifest.json with Meta's Bubblewrap (the Google package of the same
// command name ignores horizonOSAppMode, so it is never used here), then proves the result: the APK's signing
// certificate must equal the fingerprint published in assetlinks.json, or the app will not launch.
// Passwords come from BUBBLEWRAP_KEYSTORE_PASSWORD / BUBBLEWRAP_KEY_PASSWORD in this shell and are never printed.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PACKAGE_DIR = path.join(ROOT, 'quest-package');
const BUBBLEWRAP = '@meta-quest/bubblewrap-cli@1.24.1';

// Node 20.12+ refuses to start .bat files without a shell, which Bubblewrap does for gradlew.bat on Windows
// ("spawn EINVAL"). Node 20.11.1 predates that change, so Bubblewrap runs on it through npx; nothing else does.
const RUNNER = `npx --yes -p node@20.11.1 -p ${BUBBLEWRAP} bubblewrap`;

const bubblewrap = command => {
    const result = spawnSync(`${RUNNER} ${command}`, { cwd: PACKAGE_DIR, stdio: 'inherit', shell: true, env: process.env });
    if (result.error || result.status !== 0) throw new Error(`bubblewrap ${command} failed (exit ${result.status}).`);
};

async function apksigner() {
    const config = JSON.parse(await readFile(path.join(homedir(), '.bubblewrap', 'config.json'), 'utf8'));
    const tools = path.join(config.androidSdkPath, 'build-tools');
    for (const version of (await readdir(tools)).sort().reverse()) {
        const candidate = path.join(tools, version, process.platform === 'win32' ? 'apksigner.bat' : 'apksigner');
        if (existsSync(candidate)) return candidate;
    }
    throw new Error('apksigner was not found in the Android SDK build-tools. Run bubblewrap once so it installs them.');
}

async function main() {
    const manifest = JSON.parse(await readFile(path.join(PACKAGE_DIR, 'twa-manifest.json'), 'utf8').catch(() => {
        throw new Error('quest-package/twa-manifest.json is missing. Run npm run quest:prepare first (docs/QUEST.md).');
    }));
    if (!process.env.BUBBLEWRAP_KEYSTORE_PASSWORD) throw new Error('Set BUBBLEWRAP_KEYSTORE_PASSWORD in this shell first.');
    process.env.BUBBLEWRAP_KEY_PASSWORD ||= process.env.BUBBLEWRAP_KEYSTORE_PASSWORD;

    // The version in twa-manifest.json is the one that ships: without this flag `update` silently bumps it.
    bubblewrap('update --skipVersionUpgrade');
    bubblewrap('build');

    const apk = path.join(PACKAGE_DIR, 'app-release-signed.apk');
    if (!existsSync(apk)) throw new Error('Bubblewrap finished but app-release-signed.apk was not produced.');
    const verify = spawnSync(`"${await apksigner()}" verify --print-certs "${apk}"`, { encoding: 'utf8', shell: true });
    if (verify.status !== 0) throw new Error(`apksigner rejected the APK:\n${verify.stdout}${verify.stderr}`);
    const signed = /SHA-256 digest:\s*([A-Fa-f0-9]{64})/.exec(verify.stdout)?.[1]?.toUpperCase();
    const expected = (manifest.fingerprints?.[0]?.value || '').replace(/:/g, '');
    if (!signed || signed !== expected) {
        throw new Error(`The APK is signed with ${signed || 'an unknown certificate'}, not the ${expected} in assetlinks.json. It would not launch.`);
    }
    const release = path.join(PACKAGE_DIR, 'release');
    await mkdir(release, { recursive: true });
    const name = `nocturne-${manifest.appVersionName}-code${manifest.appVersionCode}-${manifest.horizonOSAppMode.toLowerCase()}.apk`;
    await copyFile(apk, path.join(release, name));
    console.log(`\nSigned APK verified against your certificate: quest-package/release/${name}`);
    console.log(`Package ${manifest.packageId}, version ${manifest.appVersionName} (code ${manifest.appVersionCode}), mode ${manifest.horizonOSAppMode}.`);
    console.log('Next: adb install -r the APK on a headset and test (docs/QUEST.md), then upload it.');
}

main().catch(error => {
    console.error(`APK build failed: ${error.message}`);
    process.exitCode = 1;
});
