import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../src/shared/startup-preferences.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;
const context = vm.createContext({ exports: {} });
vm.runInContext(compiled, context);
const { VIEW_PREFERENCE_STORAGE_KEYS: keys, resetStartupPreferences } = context.exports;
const values = new Map(Object.values(keys).map(key => [key, 'old preference']));
values.set('unrelated-history', 'keep');
const storage = { removeItem: key => values.delete(key) };

resetStartupPreferences(() => storage);
assert.deepEqual([...values], [['unrelated-history', 'keep']]);
assert.equal(keys.initialCameraPose, 'supersplat.desktop.initialCameraPose.v1');
assert(Object.values(keys).includes('supersplat:preferences'));
values.set(keys.initialCameraPose, '{"fov":100}');
values.set(keys.editor, '{"version":1,"values":{"camera.tonemapping":"aces","bgClr":[1,0,0,1]}}');
assert(values.has(keys.editor), 'changes stay available during the current run');
resetStartupPreferences(() => storage);
assert(!values.has(keys.editor), 'next startup must discard previous editor appearance');
assert(!values.has(keys.initialCameraPose), 'next startup must discard previous camera');
assert.doesNotThrow(() => resetStartupPreferences(() => { throw new Error('Storage denied'); }));

const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const init = main.slice(main.indexOf('const init = async () =>'));
assert(init.includes('resetStartupPreferences();'), 'startup must reset persisted viewing settings');
assert(init.indexOf('resetStartupPreferences();') < init.indexOf('getPersistedInitialCameraPose()'));
assert.equal(main.match(/resetStartupPreferences\(\);/g)?.length, 1, 'reset only at application startup, never per file or mode');
console.log('Startup defaults: previous settings cleared, unrelated data retained, same-session behavior preserved');
