# SuperSplat Desktop Viewer 3.8.0

This release updates the embedded **SuperSplat Editor to 3.8.0** and the shared **PlayCanvas Engine to 2.24.0**, with desktop compatibility fixes for the new opacity pipeline and lower peak memory usage during exports. It includes the changes since v3.5.2.

## Updated Components

- SuperSplat Editor **3.8.0**, upgraded from 3.5.2.
- PlayCanvas Engine **2.24.0**, upgraded from 2.23.2. The primary Viewer and Editor modes use the same renderer.
- Splat-transform **3.11.1**, upgraded from 3.9.0, and PCUI **6.2.0**.

## Fixes And Improvements

- Fix duplicate sigmoid conversion when uploading the new linear-opacity data to the GPU. Rendering, transparency grading and export filtering now use the same opacity representation.
- Preserve supported above-one opacity metadata in PLY exports instead of silently clamping the saved data. The renderer's displayed-alpha limits are unchanged.
- Keep appearance and project settings consistent across save/reopen cycles, including repeated PLY and SSPROJ saves. SOG remains a lossy format; small compression differences are expected.
- Reduce peak export memory by retaining immutable Blob chunks instead of allocating another contiguous whole-file buffer. Native SSPROJ saves reuse the Blob directly, avoiding a second full-project copy.
- Prevent aborted download writers from publishing partial project files and reject non-finite opacity when invalid-data filtering is enabled.
- Move the native SSPROJ save integration into a reproducible upstream source patch instead of matching minified variable names.
- Verify the pinned upstream commit, desktop patch and generated asset hashes before packaging, rejecting stale or mismatched editor bundles.
- Update Vite to **6.4.6**, remove local build-machine paths from public executable metadata and embedded Rust diagnostics, and exclude debug source maps from packaged editor assets.

The lightweight Viewer UI, shared scene when switching modes, camera synchronization, Orbit controls, startup defaults and offline local-file workflow are preserved. The legacy standalone fallback remains at 1.31.2; it is not the renderer used by the primary Viewer and Editor modes.

Large exports still require sufficient RAM and free disk space for output and WebView2 Blob storage. These changes reduce redundant allocations, but do not guarantee unlimited scene sizes.

## Downloads

- **Portable:** `SuperSplat.Desktop.Viewer_3.8.0_portable.exe`
- **Windows installer:** `SuperSplat.Desktop.Viewer_3.8.0_x64-setup.exe`
- **Checksums:** `SHA256SUMS_3.8.0.txt`

Both application packages are for Windows x64 and use the system Microsoft Edge WebView2 Runtime.
