import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, copyFile, rm, symlink } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';

for (const mode of ['development', 'dist']) test(`${mode} HTTP server denies private paths and resolved symlinks but keeps public assets`, async t => {
    const fixture = await mkdtemp(fileURLToPath(new URL('../.server-test-', import.meta.url)));
    t.after(() => rm(fixture, { recursive: true, force: true }));
    const root = join(fixture, 'site'), publicRoot = mode === 'dist' ? join(root, 'dist') : root;
    await mkdir(join(root, 'scripts'), { recursive: true });
    await copyFile(fileURLToPath(new URL('../scripts/serve.mjs', import.meta.url)), join(root, 'scripts', 'serve.mjs'));
    for (const dir of ['.wrangler\\state', 'worker', '.well-known', 'textures\\environment', 'design', 'scripts', 'test'])
        await mkdir(join(publicRoot, dir), { recursive: true });
    for (const path of ['index.html', '.env.local', '.dev.vars', '.wrangler\\state\\test.sqlite',
        'worker\\secret.txt', '.well-known\\assetlinks.json', '.well-known\\.dev.vars',
        'scripts\\source.mjs', 'test\\source.mjs', 'package.json', 'textures\\environment\\example.env']) {
        await writeFile(join(publicRoot, path), 'test fixture');
    }
    await mkdir(join(fixture, 'outside'), { recursive: true });
    await writeFile(join(fixture, 'outside', 'secret.txt'), 'outside fixture');
    // Windows junctions exercise realpath protection without requiring file-symlink privilege.
    const linkType = process.platform === 'win32' ? 'junction' : 'dir';
    await symlink(join(publicRoot, 'worker'), join(publicRoot, 'private-link'), linkType);
    await symlink(join(fixture, 'outside'), join(publicRoot, 'outside-link'), linkType);
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
        once(server, 'exit').then(([code]) => { throw new Error(`Test server exited before listening: ${code}`); }),
        new Promise((_, reject) => {
            const timer = setTimeout(() => reject(new Error('Test server startup timed out')), 10000);
            timer.unref();
            t.after(() => clearTimeout(timer));
        })
    ]);
    for (const path of ['/.env.local', '/%2eenv.local', '/.dev.vars', '/.wrangler/state/test.sqlite',
        '/worker/secret.txt', '/.well-known/.dev.vars', '/scripts/source.mjs', '/test/source.mjs',
        '/package.json', '/private-link/secret.txt', '/outside-link/secret.txt']) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(5000) });
        assert.ok([400, 404].includes(response.status), `${path} must not be served (got ${response.status})`);
    }
    for (const path of ['/', '/.well-known/assetlinks.json', '/textures/environment/example.env']) {
        const response = await fetch(`http://127.0.0.1:${port}${path}`, { signal: AbortSignal.timeout(5000) });
        assert.equal(response.status, 200, `${path} must remain available`);
        assert.equal(await response.text(), 'test fixture');
    }
});
