import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createReleaseEnvironment, assertNoPrivatePaths } from './release-build-env.mjs';

const root = 'D:\\work space\\viewer';
const home = 'C:\\Users\\build-user';
const env = createReleaseEnvironment(root, { home, env: { CARGO_ENCODED_RUSTFLAGS: '-C\x1fopt-level=3' } });
const flags = env.CARGO_ENCODED_RUSTFLAGS.split('\x1f');
assert.deepEqual(flags.slice(0, 2), ['-C', 'opt-level=3']);
assert.ok(flags.includes(`--remap-path-prefix=${root}=/build/source`));
assert.ok(flags.includes('--remap-path-prefix=D:/work space/viewer=/build/source'));
assert.ok(flags.includes(`--remap-path-prefix=${home}=/build/user`));
assert.ok(flags.includes('link-arg=/PDBALTPATH:%_PDB%'));
assert.throws(() => createReleaseEnvironment(root, { home, env: { RUSTFLAGS: '-C opt-level=3' } }), /CARGO_ENCODED_RUSTFLAGS/);
for (const encoding of ['utf8', 'utf16le']) {
  assert.throws(() => assertNoPrivatePaths(Buffer.from(`${home}\\.cargo\\source.rs`, encoding)), /private build path/i);
  assert.throws(() => assertNoPrivatePaths(Buffer.from('D:\\work space\\viewer\\target\\release\\app.pdb', encoding)), /private build path/i);
}
assertNoPrivatePaths(Buffer.from('/build/cargo/source.rs\0supersplat-desktop-viewer.pdb'));
for (const file of process.argv.slice(2)) {
  assertNoPrivatePaths(await readFile(file));
  console.log(`No private build paths: ${file}`);
}
console.log('Release privacy: encoded flags, path remapping and binary checks passed');
