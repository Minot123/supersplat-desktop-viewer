import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const mainTs = await readFile(path.join(rootDir, 'src', 'main.ts'), 'utf8');
const prepareEditor = await readFile(path.join(rootDir, 'scripts', 'prepare-editor.mjs'), 'utf8');

const checks = [
  {
    file: 'src/main.ts',
    label: 'Viewer mounts SuperSplat Editor renderer in view-only mode',
    ok: mainTs.includes('mountEditorBackedViewer') && mainTs.includes("desktopViewMode: 'viewer'")
  },
  {
    file: 'src/main.ts',
    label: 'Embedded editor stage can be reused without removing permanent DOM',
    ok: mainTs.includes('removeRoot?: boolean') && mainTs.includes('removeRoot !== false')
  },
  {
    file: 'src/main.ts',
    label: 'Viewer controls proxy into the embedded editor bridge',
    ok:
      mainTs.includes('__desktopSetSceneTransform') &&
      mainTs.includes('__desktopSetInitialCameraPose') &&
      mainTs.includes('__desktopGetSceneStats')
  },
  {
    file: 'scripts/prepare-editor.mjs',
    label: 'Editor bridge exposes view-only renderer mode',
    ok:
      prepareEditor.includes("params.get('desktopViewMode')") &&
      prepareEditor.includes("document.body.dataset.desktopViewMode")
  },
  {
    file: 'scripts/prepare-editor.mjs',
    label: 'Editor bridge exposes scene/camera control methods for Viewer UI',
    ok:
      prepareEditor.includes('window.__desktopSetSceneTransform') &&
      prepareEditor.includes('window.__desktopSetInitialCameraPose') &&
      prepareEditor.includes('window.__desktopGetSceneStats')
  },
  {
    file: 'scripts/prepare-editor.mjs',
    label: 'View-only editor renderer hides all editor chrome while keeping canvas visible',
    ok:
      prepareEditor.includes('#canvas-container > :not(canvas):not(#canvas)') &&
      prepareEditor.includes('#app-container > :not(#editor-container)') &&
      prepareEditor.includes('#main-container > :not(#canvas-container)')
  },
  {
    file: 'scripts/prepare-editor.mjs',
    label: 'View-only editor renderer disables grid and bounds overlays inside the canvas',
    ok:
      prepareEditor.includes("events.fire('grid.setVisible', false)") &&
      prepareEditor.includes("events.fire('camera.setBound', false)") &&
      prepareEditor.includes("events.fire('camera.setBoundDimensions', false)") &&
      prepareEditor.includes("events.fire('camera.setOverlay', false)")
  },
  {
    file: 'scripts/prepare-editor.mjs',
    label: 'View-only editor renderer starts with Fly Camera controls',
    ok:
      prepareEditor.includes("events.fire('camera.setControlMode', 'fly')") &&
      prepareEditor.includes("window.scene.camera.controlMode = 'fly'")
  },
  {
    file: 'scripts/prepare-editor.mjs',
    label: 'Desktop rotation controls apply splat transform directly without sticky user-move blocking',
    ok:
      prepareEditor.includes('const applySceneTransformNow') &&
      prepareEditor.includes('splat.move(position, rotation, scale)') &&
      prepareEditor.includes('return applySceneTransformNow(sceneTransform) ?? sceneTransform')
  },
  {
    file: 'scripts/prepare-editor.mjs',
    label: 'Desktop rotation controls target the real splat element, not debug overlays',
    ok:
      prepareEditor.includes("element?.type === 'splat'") &&
      prepareEditor.includes('element?.splatData') &&
      prepareEditor.includes('element?.entity?.gsplat')
  },
  {
    file: 'src/main.ts',
    label: 'Reset button restores model rotation axes to default values',
    ok:
      mainTs.includes('const resetSceneTransformToDefault') &&
      mainTs.includes('viewer.setDesktopSceneTransform(DEFAULT_SCENE_TRANSFORM)') &&
      mainTs.includes('applyModelRotationControlsState(DEFAULT_SCENE_TRANSFORM, true)')
  }
];

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  console.log(`${check.ok ? 'ok' : 'not ok'} - ${check.file}: ${check.label}`);
}

if (failed.length > 0) {
  process.exitCode = 1;
}
