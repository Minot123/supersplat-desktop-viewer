// Serialized into the embedded editor bridge; keep this factory self-contained.
export function createEditorModeController(getScene, body, initialMode) {
  let mode = initialMode;
  let saved = null;
  const settings = [
    ['grid.visible', 'grid.setVisible', false],
    ['camera.bound', 'camera.setBound', false],
    ['camera.boundDimensions', 'camera.setBoundDimensions', false],
    ['camera.showPoses', 'camera.setShowPoses', false],
    ['camera.showInfo', 'camera.setShowInfo', false],
    ['view.perfOverlay', 'view.setPerfOverlay', false],
    ['view.overdraw', 'view.setOverdraw', false],
    ['view.editView', 'view.setEditView', false],
    ['camera.controlMode', 'camera.setControlMode', 'orbit']
  ];
  const readyScene = () => {
    const scene = getScene();
    return scene?.camera && scene.events?.functions?.has('camera.controlMode') ? scene : null;
  };
  const apply = () => {
    const scene = readyScene();
    if (!scene) return false;
    const { events, camera } = scene;
    if (mode === 'viewer') {
      if (!saved) {
        saved = {
          values: settings.map(([key]) => events.functions.has(key) ? events.invoke(key) : undefined),
          overlays: camera.renderOverlays,
          tool: events.invoke('tool.active')
        };
      }
      for (const [key, command, value] of settings) {
        if (events.functions.has(key) && events.invoke(key) !== value) events.fire(command, value);
      }
      if (events.invoke('tool.active')) events.fire('tool.deactivate');
      camera.renderOverlays = false;
      camera.controlMode = 'orbit';
    }
    return true;
  };
  const setMode = (nextMode) => {
    const scene = readyScene();
    if (!scene || !['viewer', 'editor'].includes(nextMode)) return false;
    if (nextMode === mode) return apply();
    mode = nextMode;
    body.dataset.desktopViewMode = mode;
    if (mode === 'editor' && saved) {
      const snapshot = saved;
      saved = null;
      settings.forEach(([, command], i) => {
        if (snapshot.values[i] !== undefined) scene.events.fire(command, snapshot.values[i]);
      });
      scene.camera.renderOverlays = snapshot.overlays;
      if (snapshot.tool && scene.events.invoke('tool.active') !== snapshot.tool) {
        scene.events.fire('tool.' + snapshot.tool);
      }
    } else {
      apply();
    }
    scene.forceRender = true;
    return true;
  };
  body.dataset.desktopViewMode = mode;
  return { apply, setMode };
}
