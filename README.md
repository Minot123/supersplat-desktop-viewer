# SuperSplat Desktop Viewer

Lightweight offline Windows desktop viewer for 3D Gaussian Splat scenes, built with Tauri, TypeScript, and `@playcanvas/supersplat-viewer`.

## Features

- Native Windows shell on Tauri instead of Electron
- Open `.ply`, `.sog`,  and `.ssproj`
- `Open with...`, drag-and-drop, and OS file-open flow
- Disabled autoplay / auto-rotation
- Desktop camera and scene controls
- Loading overlay and scene status UI
- Session-level persistence for `Field of View` and model rotation
- Internal localhost streaming path for large scenes

## Requirements

- Node.js
- Rust toolchain
- Windows SDK / MSVC Build Tools
- WebView2 Runtime installed on the system

## Development

```bash
npm install
npm run typecheck
npm run build
npm run dist
```

## Build Outputs

- `npm run build` prepares viewer assets and builds the frontend
- `npm run dist` creates the Windows executable and the NSIS installer

Local artifacts are generated in:

- `src-tauri/target/release/supersplat-desktop-viewer.exe`
- `src-tauri/target/release/bundle/nsis/`

## Notes

- Generated folders such as `dist`, `public/viewer`, `public/licenses`, and `src-tauri/target` are not committed
- Large-scene loading now uses an internal localhost streaming path to avoid the earlier WebView2 crash pattern seen on repeated heavy scene opens

## Agent Memory Workflow

This repository uses GitHub Issues and GitHub Projects as durable memory for agent-driven work.

- task context lives in Issues
- cross-session state is stored in handoff comments
- project status is tracked in a dedicated GitHub Project
- helper scripts live in `scripts/`

See [docs/agent-memory.md](docs/agent-memory.md) for the full workflow.

Repository helpers:

- `scripts/gh-project-bootstrap.ps1`
- `scripts/gh-start-task.ps1`
- `scripts/gh-handoff.ps1`
