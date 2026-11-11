import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import versions from '../upstream-versions.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cwd = path.resolve(root, '../scratch', versions.editor.checkout);
const patch = path.join(root, 'patches', `supersplat-${versions.editor.version}-desktop.patch`);
const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
if (commit !== versions.editor.commit) throw new Error(`Wrong upstream commit: ${commit}`);
const alreadyApplied = spawnSync('git', ['apply', '--reverse', '--check', patch], { cwd });
if (alreadyApplied.status !== 0) {
  execFileSync('git', ['apply', '--check', patch], { cwd, stdio: 'inherit' });
  execFileSync('git', ['apply', patch], { cwd, stdio: 'inherit' });
}
console.log(`Upstream ${versions.editor.version}: desktop and linear-opacity patch verified`);
