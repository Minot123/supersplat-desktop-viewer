import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import versions from '../upstream-versions.json' with { type: 'json' };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const checkout = path.resolve(root, '../scratch', versions.editor.checkout);
export const dist = path.join(checkout, 'dist');
export const provenanceFile = path.join(dist, 'desktop-build.json');
const hash = data => createHash('sha256').update(data).digest('hex');
const normalize = text => text.replace(/\r\n/g, '\n');
const git = args => execFileSync('git', args, { cwd: checkout, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trimEnd();

export const assertBuildProvenance = (actual, expected) => {
  assert.deepEqual(actual, expected, 'Editor bundle is stale or differs from the pinned patched sources. Run npm run build:editor.');
};

export const sourceState = async () => {
  const commit = git(['rev-parse', 'HEAD']);
  assert.equal(commit, versions.editor.commit, 'Unexpected upstream commit');
  const expected = normalize(await readFile(path.join(root, 'patches', `supersplat-${versions.editor.version}-desktop.patch`), 'utf8')).trimEnd();
  const actual = normalize(git(['diff', '--no-color', '--no-ext-diff', '--binary', 'HEAD']));
  assert.equal(actual, expected, 'Upstream tree differs from the desktop patch; preserve local edits and inspect them before building.');
  assert.equal(git(['ls-files', '--others', '--exclude-standard']), '', 'Unexpected untracked files in upstream checkout');
  return { commit, patchSha256: hash(expected), versions };
};

const assetHashes = async (dir = dist, prefix = '') => {
  const result = {};
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix + entry.name;
    if (name === 'desktop-build.json') continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(result, await assetHashes(file, `${name}/`));
    else result[name] = hash(await readFile(file));
  }
  return result;
};

export const buildState = async () => ({ source: await sourceState(), assets: await assetHashes() });
export const verifyUpstreamBuild = async () => {
  const recorded = JSON.parse(await readFile(provenanceFile, 'utf8'));
  assertBuildProvenance(await buildState(), recorded);
};
