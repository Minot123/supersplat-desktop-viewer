import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { assertBuildProvenance, buildState, checkout, provenanceFile, sourceState } from './upstream-build-state.mjs';

execFileSync(process.execPath, [fileURLToPath(new URL('./prepare-upstream.mjs', import.meta.url))], { stdio: 'inherit' });
const before = await sourceState();
if (process.platform === 'win32') {
  execFileSync('cmd.exe', ['/d', '/s', '/c', 'npm run build'], { cwd: checkout, stdio: 'inherit' });
} else {
  execFileSync('npm', ['run', 'build'], { cwd: checkout, stdio: 'inherit' });
}
const state = await buildState();
assertBuildProvenance(state.source, before);
await writeFile(provenanceFile, JSON.stringify(state, null, 2) + '\n');
console.log('Editor bundle provenance recorded');
