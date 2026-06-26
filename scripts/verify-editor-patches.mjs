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
  ['ssproj URL import creates File from bytes', indexJs.includes('i=await n.arrayBuffer();l=new File([new Uint8Array(i)]')],
  ['doc.load guards inputs by numeric size', indexJs.includes('n=typeof n?.size=="number"?n:new File')],
  ['desktop ssproj save hook is installed', indexHtml.includes('createDesktopSsprojWritable')],
  ['desktop ssproj save keeps original file name', indexHtml.includes('desktopProjectName')],
  ['desktop ssproj save waits for loaded splats', indexHtml.includes('assertDesktopProjectReadyToSave') && indexHtml.includes('scene.allSplats')],
  ['ssproj save stores internal splat names', indexJs.includes('name:`splat_${e}.ply`')]
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
