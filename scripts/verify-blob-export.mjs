import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { register } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkout } from './upstream-build-state.mjs';

register(pathToFileURL(path.join(checkout, 'test/ts-resolve.mjs')));
const { BrowserFileSystem } = await import(pathToFileURL(path.join(checkout, 'test/.build/src/io/write/browser-file-system.js')));
const failures = [];
const check = async (name, test) => {
  try { await test(); console.log(`OK ${name}`); }
  catch (e) { failures.push(name); console.error(`FAIL ${name}: ${e.message}`); }
};

await check('download writer preserves reused chunks and passes a Blob without concatenating the file', async () => {
  let result;
  globalThis.window = { __desktopSaveSsproj: async data => { result = data; } };
  const writer = new BrowserFileSystem('scene.ssproj').createWriter('scene.ssproj');
  const bytes = new Uint8Array([9, 1, 2, 3, 9]).subarray(1, 4);
  await writer.write(bytes);
  bytes.fill(4);
  await writer.write(bytes);
  assert.equal(writer.bytesWritten, 6);
  await writer.close();
  assert.ok(result instanceof Blob, 'Whole-file Uint8Array allocation must not be used');
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())], [1, 2, 3, 4, 4, 4]);
});

await check('aborted download does not publish a partial project', async () => {
  let saved = false;
  globalThis.window = { __desktopSaveSsproj: async () => { saved = true; } };
  const writer = new BrowserFileSystem('scene.ssproj').createWriter('scene.ssproj');
  await writer.write(new Uint8Array([1]));
  await writer.abort();
  await writer.close();
  assert.equal(saved, false);
});

await check('native project PUT sends the Blob without copying it through arrayBuffer', async () => {
  const bridge = await readFile(fileURLToPath(new URL('./prepare-editor.mjs', import.meta.url)), 'utf8');
  const source = bridge.match(/const saveDesktopSsproj = (async \(value\) => \{[\s\S]*?\n  \});/)[1];
  const blob = new Blob(['project data']);
  const save = new Function('assertDesktopProjectReadyToSave', 'toUint8Array', 'streamUrl', 'fetch', `return (${source});`)(
    () => {}, () => { throw new Error('Unnecessary whole-project copy'); }, 'http://127.0.0.1/project',
    async (_, options) => { assert.equal(options.body, blob); return { ok: true }; }
  );
  await save(blob);
});
delete globalThis.window;
if (failures.length) throw new Error(`${failures.length} Blob export regressions`);
