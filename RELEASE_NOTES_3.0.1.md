# SuperSplat Desktop Viewer 3.0.1

- Update the bundled SuperSplat Editor from 3.1.2 to the latest stable release, 3.3.0 (September 14, 2026), pinned to `f345ae5d667f4134e21be7dec01b09b78893203a`.
- Keep the editor's pinned PlayCanvas 2.22.1 and splat-transform 3.4.2 dependencies.
- Reuse the loaded editor-backed scene when switching between Viewer and Editor. No iframe navigation, file reread, scene recreation or GPU re-upload is requested by these transitions.
- Keep camera pose, live model edits and undo history in the same running editor instance. Returning to Viewer no longer reloads the saved file and discards unsaved edits.
- Default to Orbit controls in Viewer. Restore editor overlay settings and the active tool when returning to Editor; hide overlays and deactivate editing tools in Viewer.

This change accelerates mode switching, not the first opening of a file. Opening a different file still uses the existing scene replacement path. The shared-scene shortcut applies to files using the editor-backed renderer; the fallback LOD viewer remains separate.
