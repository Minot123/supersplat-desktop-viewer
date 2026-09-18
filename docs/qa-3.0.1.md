# 3.0.1 verification

## Browser integration

Tested the production frontend and bundled SuperSplat Editor 3.3.0 in headless Microsoft Edge with WebGPU. Native Tauri file commands were mocked; scene bytes were served by a local HTTP range server. The test scene was a generated binary PLY containing 256 Gaussians.

- Initial Viewer load rendered 256 splats with Orbit controls and no editor overlays.
- Opening Editor preserved the exact JavaScript scene object and iframe URL.
- Scene HTTP request count remained at 4 after switching modes; only one native open-stream command had been issued.
- Changed X rotation to 25 degrees through the editor input and moved the camera with the mouse. Returning to Viewer preserved the unsaved transform and the same scene.
- After camera inertia settled, another Viewer/Editor round trip preserved camera position, target and FOV exactly. The editor still reported an unsaved document.
- Replacing the file from Editor closed the previous stream once, opened one new stream and rendered the replacement in Viewer.
- Visually inspected editor chrome and the clean Viewer layout. No JavaScript page errors; one non-scene 404 was reported by the browser console.

This verifies browser-side scene reuse, not native WebView2 performance on a large user scene. The Rust file transport was unchanged in this build.

## Automated checks

- `node scripts/verify-editor-mode.mjs`: executable controller and shell-handler tests for Orbit, scene reuse, overlay/tool restoration and retained edits.
- `node scripts/verify-loading-lifecycle.mjs`: existing first-frame and transform regression checks.
- `node scripts/verify-editor-backed-viewer.mjs` and `node scripts/verify-editor-patches.mjs`: integration contract checks.
- TypeScript and production frontend build.
