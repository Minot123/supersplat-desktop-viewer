import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const editorDir = path.join(rootDir, 'public', 'editor');

const indexHtml = await readFile(path.join(editorDir, 'index.html'), 'utf8');
const indexJs = await readFile(path.join(editorDir, 'index.js'), 'utf8');

const checks = [
  ['editor module has cache buster', /<script type="module" src="\.\/index\.js\?desktop=/.test(indexHtml)],
  ['editor bridge clears stale browser caches', indexHtml.includes('navigator.serviceWorker') && indexHtml.includes('window.caches')],
  ['ssproj URL import creates a File from the fetched Blob', indexJs.includes('new File([await(await fetch(') && indexJs.includes(')).blob()]')],
  ['desktop ssproj save uses the native stream hook', indexHtml.includes('window.__desktopSaveSsproj') && indexJs.includes('window.__desktopSaveSsproj')],
  ['desktop ssproj save bypasses the directory picker flow', indexHtml.includes('window.showDirectoryPicker = undefined')],
  ['desktop ssproj save hook is installed', indexHtml.includes('createDesktopSsprojWritable')],
  ['desktop ssproj save keeps original file name', indexHtml.includes('desktopProjectName')],
  ['desktop ssproj save waits for loaded splats', indexHtml.includes('assertDesktopProjectReadyToSave') && indexHtml.includes('scene.allSplats')],
  ['ssproj v1 save stores resource and instance files', indexJs.includes('filename:`resource_${e}.ply`') && indexJs.includes('instances:`instances_${e}.bin`')]
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
