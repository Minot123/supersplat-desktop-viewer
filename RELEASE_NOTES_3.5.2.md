# SuperSplat Desktop Viewer 3.5.2

This release updates the embedded **SuperSplat Editor to 3.5.2** and the shared **PlayCanvas Engine to 2.23.2**. It includes all desktop changes since the previous public release, v3.0.2.

## Updated Components

- [SuperSplat Editor 3.5.2](https://github.com/playcanvas/supersplat/releases/tag/v3.5.2), upgraded from 3.3.0.
- [PlayCanvas Engine 2.23.2](https://github.com/playcanvas/engine/releases/tag/v2.23.2), upgraded from 2.22.1. The primary Viewer and Editor modes use the same updated renderer.
- Splat-transform 3.9.0, following the editor's upstream dependency update.

## Fixes And Improvements

- Fix **"Failed to fetch while saving file"** during large-scene PLY and SOG exports. The local file server now reuses HTTP connections instead of exhausting Windows TCP ports with thousands of short-lived range requests.
- Preserve byte-range reads, HEAD requests and explicit connection-close behavior, while rejecting ambiguous requests and detecting truncated file responses.
- Align the desktop version with the bundled SuperSplat Editor version. Rebuilding no longer increments an independent desktop patch number.
- Pin the upstream editor commit and engine override, synchronize all version manifests, and reject mismatched editor builds during packaging.
- Refresh three transitive build-tool dependencies flagged by npm audit, and update third-party notices and build documentation.

The lightweight Viewer UI, shared scene when switching modes, camera synchronization, startup defaults and offline local-file workflow are preserved. The legacy standalone viewer is unchanged; it is not the renderer used by the primary Viewer and Editor modes.

## Downloads

- **Portable:** `SuperSplat Desktop Viewer_3.5.2_portable.exe`
- **Windows installer:** `SuperSplat Desktop Viewer_3.5.2_x64-setup.exe`
