# SuperSplat Desktop Viewer 3.0.0

Updated the bundled **SuperSplat Editor to 3.1.2** and **PlayCanvas engine to 2.22.1**, with large-file loading fixes and compatibility updates for the desktop integration.

This release includes all changes since the previous GitHub release, **v0.2.33**, including the local 0.2.34 and 0.2.35 builds. Application version numbering now starts at **3.0.0**; this is separate from the bundled editor version.

## Component and compatibility updates

- SuperSplat Editor: **3.1.2**, source commit `0911f786db652a7700068fe6ccdfe32e24269e1d`.
- PlayCanvas engine used by the editor-backed renderer: **2.22.1**.
- Fallback `@playcanvas/supersplat-viewer`: **1.26.3 → 1.31.2**.
- Bundled editor processing dependency `@playcanvas/splat-transform`: **3.4.2**.
- Adapt desktop rotation controls and exact splat counts to SuperSplat 3's layer/resource structure.
- Adapt the desktop `.ssproj` save integration to the updated editor writer and project format.
- Update fallback viewer patches for upstream filename handling and shader changes.

## Loading fixes

- Support single HTTP byte ranges for local files, including suffix/open-ended ranges, HEAD, 206 and 416 responses, and CORS-exposed Content-Range. The editor can now read file ranges without its mandatory whole-file memory fallback.
- Use the current open file size rather than stale session metadata for local file responses.
- Keep loading progress indeterminate until scene preparation completes instead of showing 100% after the editor HTML loads.
- Wait for an editor post-render event with loaded splats, surface uncaught editor errors, and allow up to ten minutes for large-scene preparation.
- Stop replenishing transform retries on bounds changes and skip identical transforms.
- Remove repeated full-DOM filename scans from the animation-frame polling loop.
- Explicitly release completed scene layers and await local HTTP session cleanup before loading a replacement.

## Notes

- The loading fixes retain the editor-backed rendering path and Morton ordering. Persistent editor reuse and worker-based preprocessing are not part of this build.
- Large-scene load-time improvements require runtime measurement; no speedup factor is claimed.

## Downloads

- **SuperSplat Desktop Viewer_3.0.0_x64-setup.exe**: Windows x64 installer.
- **SuperSplat Desktop Viewer_3.0.0_portable.exe**: portable Windows executable. Microsoft Edge WebView2 Runtime is required.

[Full source comparison](https://github.com/Minot123/supersplat-desktop-viewer/compare/v0.2.33...v3.0.0)
