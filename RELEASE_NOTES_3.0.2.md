# SuperSplat Desktop Viewer 3.0.2

Updated the bundled **SuperSplat Editor from 3.1.2 to 3.3.0**, removed duplicate scene loading when switching between Viewer and Editor, and made every new application run start with default viewing settings.

This is a cumulative update from **v3.0.0**, including all changes from the local 3.0.1 and 3.0.2 builds.

## Component updates

- SuperSplat Editor: **3.1.2 -> 3.3.0**, pinned to source commit `f345ae5d667f4134e21be7dec01b09b78893203a`.
- PlayCanvas engine remains **2.22.1**, as pinned by the bundled editor.
- Editor processing dependency `@playcanvas/splat-transform` remains **3.4.2**.
- Fallback `@playcanvas/supersplat-viewer` remains **1.31.2**.

## Switch modes without reloading the scene

- Viewer and Editor reuse the same loaded editor-backed scene instead of navigating the iframe and loading the file again.
- Mode switches no longer request a file reread, scene recreation or GPU re-upload.
- Keep the current camera pose, live model edits and undo history when switching modes. Returning to Viewer no longer reloads the saved file and discards unsaved edits.
- Viewer defaults to **Orbit** controls and hides editor overlays and editing tools for a clean image.
- Restore the editor's overlay preferences and active tool when returning to Editor.

## Default settings on every startup

- Start each new application run with defaults instead of restoring the previous run's background, tone mapping, field of view, camera or other viewing preferences.
- Default startup uses a **black background**, **Linear tone mapping**, **75-degree FOV**, the default initial camera position and **Orbit** controls in Viewer.
- Reset the fallback viewer's performance, navigation and annotation preferences as well.
- Keep settings available during the current run, including Viewer/Editor switches; the reset happens at startup, not on every file open.
- Preserve unrelated browser data and scene files. Settings explicitly saved in an opened `.ssproj` still load as part of that project.

## Scope

The shared-scene change targets switching modes after a scene has loaded; it does not change the first-open loading pipeline. Opening a different file still replaces the scene. The fallback LOD viewer remains a separate renderer and does not use this shared-scene shortcut.

## Downloads

- **SuperSplat.Desktop.Viewer_3.0.2_x64-setup.exe**: Windows x64 installer.
- **SuperSplat.Desktop.Viewer_3.0.2_portable.exe**: portable Windows executable. Microsoft Edge WebView2 Runtime is required.

[Full source comparison](https://github.com/Minot123/supersplat-desktop-viewer/compare/v3.0.0...v3.0.2)
