import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReleaseEnvironment, assertNoPrivatePaths } from './release-build-env.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.platform !== 'win32') throw new Error('This release command packages the Windows MSVC build.');
const result = spawnSync('cmd.exe', ['/d', '/s', '/c', 'scripts\\run-tauri.cmd build'], {
  cwd: root,
  env: createReleaseEnvironment(root),
  stdio: 'inherit'
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);
assertNoPrivatePaths(await readFile(path.join(root, 'src-tauri/target/release/supersplat-desktop-viewer.exe')));
console.log('Release executable privacy check passed');
