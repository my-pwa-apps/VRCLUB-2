import { mkdir, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { generateInvitationCode, invitationCodeHash } from '../worker/src/payments.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function generateInvitations(count) {
    if (!Number.isSafeInteger(count) || count < 1 || count > 100) {
        throw new Error('Invitation count must be an integer from 1 to 100.');
    }
    const createdAt = new Date().toISOString();
    const invitations = [];
    const codes = new Set();
    for (let i = 0; i < count; i++) {
        let code;
        for (let attempt = 0; attempt < 10; attempt++) {
            code = generateInvitationCode();
            if (!codes.has(code)) break;
            code = null;
        }
        if (!code) throw new Error('Could not generate distinct invitation codes. Retry generation.');
        codes.add(code);
        invitations.push({ code, hash: await invitationCodeHash(code) });
    }
    const sql = invitations.map(({ hash }) =>
        `INSERT INTO vr_invitations (code_hash, created_at) VALUES ('${hash}', '${createdAt}');`
    ).join('\n') + '\n';
    return { invitations, sql };
}

export async function writeInvitations(output, count) {
    if (!output || !path.isAbsolute(output)) throw new Error('Supply --out with an absolute path to a NEW private folder outside the repository.');
    const parent = await realpath(path.dirname(output));
    const root = await realpath(ROOT);
    const destination = path.join(parent, path.basename(output));
    const relative = path.relative(root, destination);
    if (relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))) {
        throw new Error('Invitation files must stay outside the repository and deployable web tree.');
    }
    const { invitations, sql } = await generateInvitations(count);
    // A new folder only: never overwrite a previous set of invitations.
    await mkdir(destination, { mode: 0o700 });
    await writeFile(path.join(destination, 'invitations.json'), JSON.stringify(invitations, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    await writeFile(path.join(destination, 'invitations.sql'), sql, { flag: 'wx', mode: 0o600 });
    return destination;
}

async function main() {
    const args = process.argv.slice(2);
    let count = 1, output;
    for (let i = 0; i < args.length; i += 2) {
        if (!args[i + 1] || !['--count', '--out'].includes(args[i])) {
            throw new Error('Usage: npm run vr:codes -- --count 5 --out "<absolute new private folder>"');
        }
        if (args[i] === '--count') count = Number(args[i + 1]);
        else output = args[i + 1];
    }
    const destination = await writeInvitations(output, count);
    console.log(`Created ${count} one-use invitations in ${destination}. No codes were printed or activated.`);
    console.log('Import invitations.sql successfully with Wrangler before distributing codes. If an identifier collision is reported, regenerate the batch. See docs/QUEST.md.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    main().catch(error => {
        console.error(`Invitation generation failed: ${error.message}`);
        process.exitCode = 1;
    });
}
