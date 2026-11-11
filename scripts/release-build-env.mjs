import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const variants = value => [...new Set([value, value.replaceAll('\\', '/')])];

export const createReleaseEnvironment = (root, { home = os.homedir(), env = process.env } = {}) => {
  if (env.RUSTFLAGS && !env.CARGO_ENCODED_RUSTFLAGS) {
    throw new Error('Use CARGO_ENCODED_RUSTFLAGS instead of RUSTFLAGS for release builds with spaces in paths.');
  }
  const flags = env.CARGO_ENCODED_RUSTFLAGS?.split('\x1f').filter(Boolean) ?? [];
  const mappings = [
    [home, '/build/user'],
    [root, '/build/source'],
    [env.CARGO_HOME || path.join(home, '.cargo'), '/build/cargo'],
    [env.RUSTUP_HOME || path.join(home, '.rustup'), '/build/rustup']
  ];
  for (const [source, destination] of mappings) {
    for (const prefix of variants(source)) flags.push(`--remap-path-prefix=${prefix}=${destination}`);
  }
  // MSVC writes this path independently of rustc's source-path remapping.
  flags.push('-C', 'link-arg=/PDBALTPATH:%_PDB%');
  return { ...env, CARGO_ENCODED_RUSTFLAGS: flags.join('\x1f') };
};

export const assertNoPrivatePaths = (bytes) => {
  const forbidden = [...variants(os.homedir()), ...variants(repository)].map(value => value.toLowerCase());
  for (const encoding of ['utf8', 'utf16le']) {
    const text = bytes.toString(encoding);
    const hasProfile = /[A-Z]:[\\/]Users[\\/]/i.test(text);
    const hasPdbPath = /[A-Z]:[\\/][^\x00\r\n]{1,500}\.pdb\b/i.test(text);
    assert.ok(!hasProfile && !hasPdbPath && !forbidden.some(prefix => text.toLowerCase().includes(prefix)), 'Private build path found in release payload');
  }
};
