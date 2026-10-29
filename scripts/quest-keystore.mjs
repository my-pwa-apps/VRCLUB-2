import { existsSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Creates the permanent Android signing key. keytool asks for the passwords and the certificate name itself, in this
// terminal: this script never sees, stores or prints them. The key must stay outside the repository and be backed up,
// because every future update of the app has to be signed with it.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function option(name) {
    const index = process.argv.indexOf(name);
    return index > -1 ? process.argv[index + 1] : undefined;
}

async function main() {
    const keystore = option('--path');
    const alias = option('--alias') || 'nocturne';
    if (!keystore || !path.isAbsolute(keystore)) {
        throw new Error('Usage: npm run quest:keystore -- --path "C:\\PrivateSigning\\nocturne.keystore" [--alias nocturne]');
    }
    const relative = path.relative(ROOT, keystore);
    if (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)) {
        throw new Error('Keep the signing keystore outside the repository.');
    }
    if (existsSync(keystore)) throw new Error(`${keystore} already exists. Refusing to overwrite a signing key.`);
    await mkdir(path.dirname(keystore), { recursive: true });
    console.log('keytool will now ask for a keystore password, then your name and organisation.');
    console.log('Use ONE password for the store and the key (press Enter when asked for a separate key password).\n');
    const result = spawnSync('keytool', ['-genkeypair', '-v', '-keystore', keystore, '-alias', alias,
        '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000'], { stdio: 'inherit' });
    if (result.error) throw new Error('keytool was not found. Install a JDK first: winget install Microsoft.OpenJDK.17');
    if (result.status !== 0 || !existsSync(keystore)) throw new Error('The keystore was not created.');
    console.log(`\nCreated ${keystore} (alias ${alias}).`);
    console.log('BACK IT UP NOW (two copies, off this machine). If it is lost you can never update the app: it would be a new app.');
    console.log('Never commit it or put it in dist/. In each shell that builds, set the password privately:');
    console.log('  $env:BUBBLEWRAP_KEYSTORE_PASSWORD = Read-Host -MaskInput "Keystore password"');
    console.log('  $env:BUBBLEWRAP_KEY_PASSWORD = $env:BUBBLEWRAP_KEYSTORE_PASSWORD');
}

main().catch(error => {
    console.error(`Keystore creation failed: ${error.message}`);
    process.exitCode = 1;
});
