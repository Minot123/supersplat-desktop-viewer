import assert from 'node:assert/strict';
import { assertBuildProvenance } from './upstream-build-state.mjs';

const expected = { source: { commit: 'pinned', patchSha256: 'patched' }, assets: { 'index.js': 'correct', 'index.html': 'correct-html' } };
assertBuildProvenance(structuredClone(expected), expected);
for (const change of [
  state => { state.source.commit = 'different'; },
  state => { state.source.patchSha256 = 'unpatched'; },
  state => { state.assets['index.js'] = 'old-bundle'; },
  state => { delete state.assets['index.html']; }
]) {
  const changed = structuredClone(expected);
  change(changed);
  assert.throws(() => assertBuildProvenance(changed, expected), /stale/);
}
console.log('Upstream provenance: wrong commits, patches and stale/missing assets rejected');
