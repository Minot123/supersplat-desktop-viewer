import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainTs = await readFile(path.join(rootDir, 'src', 'main.ts'), 'utf8');

const checks = [
  ['ssproj camera type includes tonemapping', mainTs.includes('tonemapping?: ViewerTonemapping | null;')],
  ['viewer tonemapping values are allowlisted', mainTs.includes('VALID_VIEWER_TONEMAPPINGS')],
  ['ssproj tonemapping is applied to runtime settings', mainTs.includes('settings.tonemapping = tonemapping;')]
];

const failed = checks.filter(([, ok]) => !ok);
if (failed.length) {
  for (const [name] of failed) {
    console.error(`FAIL ${name}`);
  }
  process.exit(1);
}

for (const [name] of checks) {
  console.log(`OK ${name}`);
}
