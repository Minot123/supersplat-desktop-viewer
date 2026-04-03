# Third-Party Notices

This repository is licensed under the MIT License for the original project code, except where third-party assets or dependencies retain their own licenses.

## Included third-party asset

### Google Material Design Icons / Material Symbols

- Asset used: `Lens Blur`
- Source asset in this repository: `src-tauri/icons/google-lens-blur.svg`
- Derived generated assets in this repository: files under `src-tauri/icons/`
- Upstream project: https://github.com/google/material-design-icons
- Upstream license: Apache License 2.0
- License file: https://github.com/google/material-design-icons/blob/master/LICENSE

The committed SVG source icon and the generated icon derivatives are based on the Google Material Design Icons / Material Symbols asset above and remain subject to the Apache License 2.0 terms.

## Runtime and build dependencies

### PlayCanvas SuperSplat Viewer

- Package: `@playcanvas/supersplat-viewer`
- Upstream project: https://github.com/playcanvas/supersplat-viewer
- License: MIT
- License file: https://github.com/playcanvas/supersplat-viewer/blob/main/LICENSE

This project integrates with and bundles viewer assets from `@playcanvas/supersplat-viewer` during local builds and release packaging.

### Tauri

- Packages/crates used by this project include:
  - `tauri`
  - `tauri-build`
  - `@tauri-apps/api`
  - `@tauri-apps/cli`
  - `@tauri-apps/plugin-dialog`
  - `tauri-plugin-dialog`
  - `tauri-plugin-single-instance`
- Upstream project: https://github.com/tauri-apps/tauri
- License: MIT OR Apache-2.0

### Additional open-source dependencies

Other npm and Cargo dependencies used by this repository keep their own original licenses. See the corresponding package metadata and upstream repositories for details.

## Distribution note

If you redistribute this repository or binaries built from it, preserve:

- the root `LICENSE` file
- this `THIRD_PARTY_NOTICES.md` file
- any upstream license files or notices required by bundled third-party components
