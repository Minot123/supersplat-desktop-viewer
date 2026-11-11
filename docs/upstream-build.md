# Upstream Build And Versioning

The desktop version follows the stable SuperSplat Editor tag, not the engine's independent version series. Release 3.8.0 uses Editor 3.8.0, PlayCanvas 2.24.0 and splat-transform 3.11.1.

`upstream-versions.json` records the editor tag/commit, engine override and splat-transform version. Update this file deliberately when adopting a new release; normal builds do not query the network for a newer tag.

## Editor Build

The upstream checkout is selected by `editor.checkout` in `upstream-versions.json`. Version 3.8.0 uses `../scratch/supersplat-upstream-3.8.0`, leaving the previous checkout untouched.

For a fresh checkout, run from the repository root:

```powershell
git clone --branch v3.8.0 https://github.com/playcanvas/supersplat.git ../scratch/supersplat-upstream-3.8.0
npm run prepare:upstream
```

Then, inside that checkout:

```powershell
git rev-parse HEAD
# Expected: 412d1dfa585bc88b734f41006638fca6cffef4af
npm ci
npm test
npm run lint
```

Back in the desktop repository, run `npm run build:editor`. This applies/verifies the desktop patch, builds the editor and records SHA-256 hashes for the resulting assets. `prepare:editor` checks the exact upstream commit, complete tracked diff, unexpected untracked files and asset hashes before every desktop build. A stale bundle is rejected even when its displayed version matches.

The official tag already pins Engine 2.24.0 and splat-transform 3.11.1; no dependency override is needed. `prepare:upstream` verifies the exact commit and applies `patches/supersplat-3.8.0-desktop.patch` idempotently. The patch fixes the linear-opacity contract for rendering, grading and export, preserves above-one opacity metadata, and exposes the native SSPROJ save hook in source rather than rewriting minified variables.

Run `node scripts/verify-linear-opacity.mjs` from this repository after upstream `npm test` has compiled its test modules. It checks actual Editor methods and the real splat-transform PLY reader/writer, including two save/reload cycles.

## Desktop Build

From this repository:

```powershell
npm ci
npm run version:sync
npm run dist
```

Version synchronization updates package.json, package-lock.json, Cargo.toml, Cargo.lock and tauri.conf.json. It is idempotent and runs before Tauri reads its configuration. Editor preparation rejects mismatched package versions and stale bundles that do not contain the pinned editor/engine versions.

`dist` remaps local Rust source paths to neutral build prefixes and records only the PDB filename in the executable. It checks the resulting EXE for private build paths. Use this command for public artifacts, not a direct `tauri build`. Custom compiler flags must use `CARGO_ENCODED_RUSTFLAGS` so paths containing spaces are preserved.

For isolated local testing, `npm run dist:test` uses `src-tauri/tauri.test.conf.json`: a separate application identifier/profile and window title, no file associations, and no installer. Copy its executable to a versioned test directory before any other build. Never publish this diagnostic build as the normal portable release.

Do not use independent patch/minor/major increments for desktop release names. Desktop-only changes should be described in release notes without inventing a different upstream version. Preserve previously published binaries; do not silently replace an existing release asset with a different build under the same filename. A future policy for multiple public desktop revisions of the same editor version needs an explicit decision.

The legacy standalone viewer dependency remains at 1.31.2. Its separate renderer is not used for the main Viewer or Editor modes. Migrating that fallback to the new standalone createViewer API is separate work, not required for updating the shared editor renderer.
