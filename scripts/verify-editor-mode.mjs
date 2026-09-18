import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { createEditorModeController } from './editor-mode-controller.mjs';

const values = new Map([
  ['grid.visible', true], ['camera.bound', true], ['camera.boundDimensions', true],
  ['camera.controlMode', 'fly'], ['tool.active', 'rotate'], ['view.editView', true]
]);
const setters = new Map([
  ['grid.setVisible', 'grid.visible'], ['camera.setBound', 'camera.bound'],
  ['camera.setBoundDimensions', 'camera.boundDimensions'],
  ['camera.setControlMode', 'camera.controlMode'], ['view.setEditView', 'view.editView']
]);
const camera = { controlMode: 'fly', renderOverlays: true, position: { x: 1, y: 2, z: 3 } };
const model = { rotation: 35, edits: [1, 2] };
const scene = {
  camera, model, events: {
    functions: values,
    invoke: (key) => values.get(key),
    fire(key, value) {
      if (key === 'scene.clear' || key === 'import') throw new Error('Scene must not reload');
      if (setters.has(key)) values.set(setters.get(key), value);
      if (key === 'camera.setControlMode') camera.controlMode = value;
      if (key === 'tool.deactivate') values.set('tool.active', null);
      if (key === 'tool.rotate') values.set('tool.active', 'rotate');
      if (key === 'tool.move') values.set('tool.active', 'move');
    }
  }
};
const body = { dataset: {} };
const controller = createEditorModeController(() => scene, body, 'viewer');
assert.equal(controller.apply(), true);
assert.equal(camera.controlMode, 'orbit');
assert.equal(camera.renderOverlays, false);
assert.equal(values.get('grid.visible'), false);
assert.equal(values.get('tool.active'), null);
controller.apply();
assert.equal(controller.setMode('editor'), true);
assert.equal(values.get('grid.visible'), true);
assert.equal(camera.renderOverlays, true);
assert.equal(camera.controlMode, 'fly');
assert.equal(values.get('tool.active'), 'rotate');
values.set('grid.visible', false);
values.set('tool.active', 'move');
model.edits.push(3);
camera.position.x = 99;
for (let i = 0; i < 3; ++i) {
  controller.setMode('viewer');
  controller.setMode('viewer');
  assert.equal(camera.controlMode, 'orbit');
  controller.setMode('editor');
  assert.equal(values.get('grid.visible'), false);
  assert.equal(values.get('tool.active'), 'move');
}
assert.deepEqual(model.edits, [1, 2, 3]);
assert.equal(scene.camera, camera);
assert.equal(camera.position.x, 99);
assert.equal(createEditorModeController(() => null, body, 'viewer').setMode('editor'), false);
console.log('Editor mode controller: scene identity, Orbit, overlays and edits preserved');

// Execute the actual shell handlers, rather than only checking source strings.
const source = readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');
const handlers = source.slice(source.indexOf('const switchSharedEditorMode'), source.indexOf('const handleIncomingPayload'));
const state = { mode: 'viewer', uiState: 'ready', currentFile: { name: 'fixture.ply' } };
const activeViewer = { viewer: {} };
const forbidden = () => { throw new Error('Mode switch attempted to reload or dispose the scene'); };
const shell = vm.createContext({
  state, viewerRuntime: { editorBacked: true, activeViewer },
  getEditorFrameWindow: () => ({ __desktopSetViewMode: mode => controller.setMode(mode) }),
  getActiveViewer: () => activeViewer.viewer,
  rememberSessionRotation() {}, rememberSessionFov() {}, syncInspectorControlsFromViewer() {}, render() {},
  cleanupAllViewers: forbidden, waitForViewerCleanup: forbidden, ensureEditorAssets: forbidden,
  createEditorLaunchSession: forbidden, openFromPayload: forbidden
});
vm.runInContext(ts.transpileModule(handlers, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, shell);
for (let i = 0; i < 3; ++i) {
  await vm.runInContext('openEditorInPlace()', shell);
  assert.equal(state.mode, 'editor');
  await vm.runInContext('returnFromEditorToViewer()', shell);
  assert.equal(state.mode, 'viewer');
}
assert.equal(shell.viewerRuntime.activeViewer, activeViewer);
console.log('Shell mode handlers: repeated round trips do not load, dispose or navigate');
