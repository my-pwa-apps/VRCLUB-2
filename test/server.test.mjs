import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, copyFile, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

for (const mode of ['development', 'dist']) test(`${mode} server keeps private files private while serving public assets`, async t => {
    const root = await mkdtemp(join(tmpdir(), 'vrclub-server-test-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const publicRoot = mode === 'dist' ? join(root, 'dist') : root;
    await mkdir(join(root, 'scripts'), { recursive: true });
    for (const dir of ['.wrangler/state', 'worker', '.well-known', 'textures/environment'])
        await mkdir(join(publicRoot, dir), { recursive: true });
    await copyFile(fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url)), join(root, 'scripts', 'serve.mjs'));
    for (const path of ['index.html', '.env.local', '.dev.vars', '.wrangler/state/test.sqlite',
        'worker/wrangler.toml', '.well-known/assetlinks.json', '.well-known/.dev.vars',
        'textures/environment/example.env']) {
        await writeFile(join(publicRoot, path), 'test fixture');
    }
    let hasSymlink = true;
    try {
        await symlink('.env.local', join(publicRoot, 'public-link.txt'));
    } catch (error) {
        if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
        hasSymlink = false;
        t.diagnostic('File symlinks are unavailable; skipping the symlink-specific assertion.');
    }

    const reservation = createServer();
    reservation.listen(0, '127.0.0.1');
    await once(reservation, 'listening');
    const { port } = reservation.address();
    await new Promise((resolve, reject) => reservation.close(error => error ? reject(error) : resolve()));

    const server = spawn(process.execPath, [join(root, 'scripts', 'serve.mjs'), ...(mode === 'dist' ? ['--dist'] : [])], {
        env: { ...process.env, HOST: '127.0.0.1', PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe']
    });
    t.after(async () => {
        if (server.exitCode === null) {
            server.kill();
            await once(server, 'exit');
        }
    });
    await Promise.race([
        once(server.stdout, 'data'),
        once(server, 'exit').then(([code]) => { throw new Error(`Test server exited before listening: ${code}`); })
    ]);

    const privatePaths = ['/.env.local', '/%2eenv.local', '/.dev.vars', '/.wrangler/state/test.sqlite',
        '/worker/wrangler.toml', '/.well-known/.dev.vars'];
    if (hasSymlink) privatePaths.push('/public-link.txt');
    for (const path of privatePaths) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`);
        assert.ok([400, 404].includes(response.status), `${path} must not be served (got ${response.status})`);
    }
    for (const path of ['/', '/.well-known/assetlinks.json', '/textures/environment/example.env']) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`);
        assert.equal(response.status, 200, `${path} must remain available`);
        assert.equal(await response.text(), 'test fixture');
    }
});
