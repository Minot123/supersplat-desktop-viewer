import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mainTs = await readFile(path.join(rootDir, 'src', 'main.ts'), 'utf8');
const prepareViewer = await readFile(path.join(rootDir, 'scripts', 'prepare-viewer.mjs'), 'utf8');
const publicViewer = await readFile(path.join(rootDir, 'public', 'viewer', 'index.js'), 'utf8').catch(() => '');

const checks = [
  [
    'ssproj viewer content skips reorder while direct files keep editor-style reorder',
    mainTs.includes('reorder: preparedContent.projectDocument ? false : true')
  ],
  [
    'prepared viewer disables pointer lock requests',
    prepareViewer.includes('this._keyboardMouse.source._pointerLock = false;') &&
      prepareViewer.includes('// Desktop shell keeps editor-style visible cursor controls.')
  ],
  [
    'prepared viewer no longer requests canvas pointer lock',
    publicViewer.includes('// Desktop shell keeps editor-style visible cursor controls.') &&
      !publicViewer.includes('this._canvas?.requestPointerLock();')
  ],
  [
    'non-unified viewer path bypasses unified frame:ready wait',
    prepareViewer.includes('if (config.unified === false)') &&
      publicViewer.includes('if (config.unified === false)')
  ],
  [
    'desktop viewer keeps SuperSplat Editor-style low-alpha gaussian tails',
    prepareViewer.includes('keep low-alpha gaussian tails') &&
      publicViewer.includes('keep low-alpha gaussian tails') &&
      publicViewer.includes('do not discard low-alpha forward fragments') &&
      !publicViewer.includes('clipCorner(corner, clr.w);') &&
      !publicViewer.includes('if (alpha < alphaClipForward) {')
  ],
  [
    'desktop viewer disables engine opacity dithering to match SuperSplat Editor softness',
    prepareViewer.includes('Desktop viewer matches SuperSplat Editor: do not dither splat opacity') &&
      publicViewer.includes('Desktop viewer matches SuperSplat Editor: do not dither splat opacity') &&
      !publicViewer.includes('opacityDither(alpha, id * 0.013);')
  ]
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
