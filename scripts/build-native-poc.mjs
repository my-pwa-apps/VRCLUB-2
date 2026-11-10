import { cp, mkdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const native = path.join(root, 'native-poc');
const payload = path.join(native, 'app', 'src', 'main', 'assets', 'web');

await new Promise((resolve, reject) => {
    const command = process.platform === 'win32' ? process.env.ComSpec : 'npm';
    const args = process.platform === 'win32'
        ? ['/d', '/s', '/c', 'npm run build:quest']
        : ['run', 'build:quest'];
    const child = spawn(command, args, {
        cwd: root,
        stdio: 'inherit',
        shell: false
    });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`Web build failed with exit code ${code}`)));
});

if (!existsSync(path.join(root, 'dist', 'index.html'))) {
    throw new Error('Quest web build did not produce dist/index.html');
}
await rm(payload, { recursive: true, force: true });
await mkdir(payload, { recursive: true });
await cp(path.join(root, 'dist'), payload, { recursive: true });
console.log(`Native POC payload copied to ${path.relative(root, payload)}`);
