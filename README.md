# SuperSplat Desktop Viewer

Lightweight offline Windows desktop viewer for 3D Gaussian Splat scenes, built with Tauri, TypeScript, SuperSplat Editor, and `@playcanvas/supersplat-viewer`.

[Download the latest release](https://github.com/Minot123/supersplat-desktop-viewer/releases/latest) or browse all [Releases](https://github.com/Minot123/supersplat-desktop-viewer/releases).

## Features

- Native Windows shell on Tauri instead of Electron
- Open `.ply`, `.sog`, `.ssproj`, `.meta.json`, and `.lod-meta.json`
- `Open with...`, drag-and-drop, and OS file-open flow
- Disabled autoplay / auto-rotation
- Desktop camera and scene controls
- Loading overlay and scene status UI
- Session-level persistence for `Field of View` and model rotation
- English-only UI
- Internal localhost streaming path for large scenes

## Supported Scene Types

- `.ply`
- `.sog`
- `.ssproj`
- `.meta.json`
- `.lod-meta.json`

## Downloads

- Portable build and Windows installer are published in [Releases](https://github.com/Minot123/supersplat-desktop-viewer/releases).
- Current local release artifacts are produced in `release-desktop-viewer/`.

## Versions

Desktop versions now match the bundled SuperSplat Editor version. The current build is **3.5.2**, with PlayCanvas Engine **2.23.2** shared by the main Viewer and Editor modes. Rebuilding does not increment the version independently.

Pinned upstream versions and the editor commit are recorded in [upstream-versions.json](upstream-versions.json). See [upstream build instructions](docs/upstream-build.md) for the engine override and version synchronization workflow.

## Notes

- Large-scene loading now uses an internal localhost streaming path to avoid the earlier WebView2 crash pattern seen on repeated heavy scene opens
- `.ssproj` support is runtime-oriented: the viewer opens the embedded scene payload, but does not yet apply editor-specific project metadata.

## License

- Project code: [MIT](LICENSE)
- Third-party assets and dependency notices: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
