import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const BUBBLEWRAP = '1.24.1';

// `npm run quest:doctor` tells you, in order, what is still missing before an APK can be built, and (given --url) whether
// the deployed site is ready for the wrapper. It changes nothing and needs no secrets.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const url = (() => {
    const index = process.argv.indexOf('--url');
    return index > -1 ? process.argv[index + 1] : undefined;
})();
let problems = 0;

const report = (ok, label, fix) => {
    if (!ok) problems++;
    console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${!ok && fix ? `\n       -> ${fix}` : ''}`);
};
const run = (command, args) => {
    // One command string: passing args with shell: true is deprecated, and these are fixed, trusted values.
    const result = spawnSync([command, ...args].join(' '), { encoding: 'utf8', shell: true });
    return result.error || result.status !== 0 ? null : `${result.stdout}${result.stderr}`.trim();
};

async function bubblewrapConfig() {
    try { return JSON.parse(await readFile(path.join(homedir(), '.bubblewrap', 'config.json'), 'utf8')); } catch (_) { return null; }
}

async function localTools() {
    const node = Number(process.versions.node.split('.')[0]);
    report(node >= 20, `Node ${process.versions.node}`, 'Install Node 20 or newer.');
    const java = run('java', ['-version']);
    report(!!java, `Java: ${java ? java.split('\n')[0] : 'not found'}`, 'winget install Microsoft.OpenJDK.17 (then open a new terminal).');
    report(!!run('keytool', ['-help']), 'keytool (comes with the JDK)', 'Install the JDK, as above.');
    // The Google package has the same command name but ignores horizonOSAppMode, so the build always uses Meta's through npx.
    const meta = run('npx', ['--yes', `@meta-quest/bubblewrap-cli@${BUBBLEWRAP}`, '--version']);
    report(!!meta, `Meta Bubblewrap ${BUBBLEWRAP} (run through npx)`, `npx --yes @meta-quest/bubblewrap-cli@${BUBBLEWRAP} --version must work: check the network.`);
    const config = await bubblewrapConfig();
    const sdk = config?.androidSdkPath || process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
    report(!!sdk && existsSync(sdk), `Android SDK: ${sdk || 'not set'}`, 'Run bubblewrap doctor once (Bubblewrap downloads the JDK and SDK), or set ANDROID_HOME.');
    report(!!process.env.BUBBLEWRAP_KEYSTORE_PASSWORD, 'BUBBLEWRAP_KEYSTORE_PASSWORD is set in this shell',
        '$env:BUBBLEWRAP_KEYSTORE_PASSWORD = Read-Host -MaskInput "Keystore password"');
    let manifest = null;
    try { manifest = JSON.parse(await readFile(path.join(ROOT, 'quest-package', 'twa-manifest.json'), 'utf8')); } catch (_) { /* not prepared yet */ }
    report(!!manifest, 'quest-package/twa-manifest.json exists', 'Run npm run quest:prepare (see docs/QUEST.md).');
    if (manifest) {
        report(/^[A-F0-9]{2}(?::[A-F0-9]{2}){31}$/.test(manifest.fingerprints?.[0]?.value || ''), `Signing fingerprint recorded for ${manifest.packageId}`);
        console.log(`     mode ${manifest.horizonOSAppMode}, start ${manifest.host}${manifest.startUrl}, version ${manifest.appVersionName} (code ${manifest.appVersionCode})`);
    }
    return manifest;
}

async function liveSite(base, manifest) {
    const get = async (pathname, init) => {
        try { return await fetch(new URL(pathname, base), { redirect: 'manual', ...init }); } catch (_) { return null; }
    };
    // The host answers unknown paths with the club page (a 200), so a status alone proves nothing: check what came back.
    const isHtml = response => /text\/html/i.test(response?.headers.get('content-type') || '');
    const status = async (pathname, label, fix, expect) => {
        const response = await get(pathname);
        const body = response?.status === 200 && expect ? await response.clone().text() : '';
        const ok = response?.status === 200 && (!expect || expect(response, body));
        report(ok, `${label} (${pathname}) -> ${response ? response.status : 'unreachable'}${response?.status === 200 && !ok ? ' but not the expected content' : ''}`, fix);
        return response;
    };
    console.log(`\nLive site: ${base}`);
    await status('', 'Club');
    await status('?immersive=1', 'Immersive entry');
    await status('manifest.json', 'Web manifest', undefined, response => /json/i.test(response.headers.get('content-type') || ''));
    await status('icons/icon-512.png', '512 px icon', undefined, response => /image\/png/i.test(response.headers.get('content-type') || ''));
    await status('icons/icon-maskable-512.png', 'Maskable icon', undefined, response => /image\/png/i.test(response.headers.get('content-type') || ''));
    await status('link/', 'Phone pairing page', 'Deploy the site (npm run deploy:cloudflare).', (_, body) => /Link your headset|link\.js/i.test(body));
    await status('link/link.js', 'Phone pairing script', 'Deploy the site (npm run deploy:cloudflare).', response => /javascript/i.test(response.headers.get('content-type') || ''));
    const links = new URL('/.well-known/assetlinks.json', base);
    const response = await get(links.pathname);
    let listed = [];
    try { listed = response?.status === 200 && !isHtml(response) ? await response.json() : []; } catch (_) { /* not JSON */ }
    report(Array.isArray(listed) && listed.length > 0, `Digital Asset Links (${links.pathname}) -> ${response ? response.status : 'unreachable'}${isHtml(response) ? ' (the club page, so the file is not deployed)' : ''}`,
        'Run npm run quest:prepare, then npm run deploy:cloudflare (the build copies quest-package/assetlinks.json into dist/.well-known/).');
    if (manifest && listed.length) {
        const entry = listed.find(item => item?.target?.package_name === manifest.packageId);
        const published = entry?.target?.sha256_cert_fingerprints || [];
        report(published.includes(manifest.fingerprints?.[0]?.value), `assetlinks.json names ${manifest.packageId} with your signing fingerprint`,
            'The deployed file does not match quest-package: rebuild and redeploy.');
    }
    const key = await get('/android.keystore');
    report(!key || key.status === 404 || isHtml(key), 'No keystore is served from the site');
    const api = await get('https://api.mitwee.nl/payments/entitlement', { headers: { origin: new URL(base).origin } });
    report(!!api && api.status < 500, `Access API reachable -> ${api ? api.status : 'unreachable'}`, 'npm run deploy:worker and apply migration 0007 (docs/QUEST.md).');
}

const manifest = await localTools();
if (url) {
    const base = new URL(url);
    if (!base.pathname.endsWith('/')) base.pathname += '/';
    await liveSite(base.href, manifest);
}
console.log(problems ? `\n${problems} thing(s) to fix before the APK can be built and tested.` : '\nEverything checked is ready.');
process.exitCode = problems ? 1 : 0;
