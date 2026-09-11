import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const bridge = readFileSync(new URL('./prepare-editor.mjs', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const handler = bridge.match(/events\.on\('scene.boundChanged', \(\) => \{([\s\S]*?)\n    \}\);/)[1];
let refreshed = 0;
vm.runInNewContext(handler, {
  refreshStickyCameraPose() {}, applyCameraPose() {}, applySceneTransform() {},
  refreshStickySceneTransform() { refreshed++; }
});
assert.equal(refreshed, 0, 'bounds notifications must not replenish transform retries');
const ready = main.slice(main.indexOf('const waitForEditorBackedViewerReady'), main.indexOf('const mountEditorBackedViewer'));
assert(!ready.includes('state.loadingPercent = 100'), 'HTML load must not report scene completion');
assert(ready.includes('firstFrameRendered'), 'wait for a rendered scene, not only splat count');
let moves = 0;
class Vec3 { constructor(x, y, z) { Object.assign(this, { x, y, z }); } }
class Quat {
  constructor() { Object.assign(this, { x: 0, y: 0, z: 0, w: 1 }); }
  setFromEulerAngles() {}
}
let position = new Vec3(0, 0, 0);
let rotation = new Quat();
let scale = new Vec3(1, 1, 1);
const splat = {
  entity: { getLocalPosition: () => position, getLocalRotation: () => rotation, getLocalScale: () => scale },
  move(p, r, s) { moves++; position = p; rotation = r; scale = s; }
};
const context = vm.createContext({ window: { scene: {} }, getSceneSplat: () => splat, getSceneTransform: () => ({}), successfulSceneTransformApplications: 0 });
const transformFunction = bridge.slice(bridge.indexOf('  const applySceneTransformNow'), bridge.indexOf('  const applySceneTransform ='));
vm.runInContext(transformFunction + '\napplySceneTransformNow({ positionX: 2 }); applySceneTransformNow({ positionX: 2 });', context);
assert.equal(moves, 1, 'identical transforms must not dirty scene bounds twice');
console.log('Loading lifecycle regression checks passed');
