# 3.5.2 Verification

Verified on 2026-10-14 in the native Windows Tauri/WebView2 application using an isolated profile. The installed application was not replaced. No GitHub release was published.

## Components And Versioning

The official stable releases were checked through GitHub and npm: SuperSplat Editor 3.5.2 and PlayCanvas Engine 2.23.2. The running embedded editor logged:

```text
SuperSplat v3.5.2 | SplatTransform v3.9.0 (435b972) | Engine v2.23.2 (fa431cb) | PCUI v6.1.4 (89cf9a3)
```

The editor source is tag v3.5.2, commit `f2a1b4975b4766e0ee0c95e63c2737dc2ecb6e5b`, with its engine dependency overridden from 2.23.0 to 2.23.2. The primary Viewer and Editor modes share this renderer. The legacy standalone viewer is pinned to 1.31.2 and was not migrated to its newer, incompatible createViewer API.

`verify-version-sync.mjs` checks all five version manifests, repeated synchronization without incrementing and invalid-version rejection. The test failed before the editor synchronization mode was implemented and passes afterward. Both built executable resources report 3.5.2.

## Native UI And Scene Lifecycle

Using a generated 8,192-Gaussian PLY:

- Viewer starts with the settings panel closed, Orbit controls and overlays/grid disabled.
- Editing the X rotation input changes the model quaternion; Reset restores the initial orientation.
- Setting FOV to 105 takes effect in the embedded renderer.
- Three Viewer-to-Editor-to-Viewer round trips preserve the same scene object and camera pose, with zero additional scene HTTP requests.
- Reloading the shell in the same WebView profile resets FOV to 75 and closes the panel.
- Viewer and Editor screenshots were inspected; the lightweight Viewer UI remains separate from the full Editor UI.
- No JavaScript page errors were recorded.

## Large-Scene Export

Read-only source: `kalyazin.ply`, 744,001,762 bytes, 3,000,000 Gaussians, SH degree 3. Export used the actual editor serialization handler and browser download writer, not a fake output sink.

| Output | Bytes | Export duration | Reopened Gaussians |
| --- | ---: | ---: | ---: |
| PLY | 708,001,478 | 71.351 s | 3,000,000 |
| SOG | 40,568,541 | 122.251 s | 2,994,508 |

SOG settings: SH degree 3, one compression iteration, upstream low-opacity/invalid-data filtering enabled. These are single-run observations, not a controlled performance comparison or a benchmark of the default ten-iteration SOG setting.

The combined load/export session made 59,552 scene requests over one TCP connection with `Connection: keep-alive`. No failed requests or export errors occurred. Both output files were reopened in the native application and reported `firstFrameRendered: true`, `loadError: null`.

The original source SHA-256 remained unchanged:

```text
EABEA2801D91317AC0EF75B65960B0FA8461F724D400521157F01A6067ABF435
```

## Project Save Round Trip

Created a separate 8,192-Gaussian `.ssproj`, opened it through native file-open IPC, set rotation Z to 42 degrees and background RGBA to `[0.12, 0.23, 0.34, 1]`, then saved through the existing native localhost PUT path. Reopening the 534,271-byte project preserved both properties and rendered successfully. Switching Viewer/Editor after reopening also succeeded without JavaScript errors.

Only QA-generated project files were modified; the user's source model was not overwritten.

## Automated Checks And Artifacts

- All eight `scripts/verify-*.mjs` checks passed.
- `cargo test --release --lib`: 10 tests passed, including the retained 3.0.3 keep-alive export regression tests.
- TypeScript checking, Vite production build, Rust release build and NSIS packaging passed.
- `git diff --check` passed.
- Desktop npm audit: zero advisories, including build dependencies, after refreshing PostCSS, nanoid and source-map-js.
- The upstream editor development tree still reports 13 tooling advisories. The affected package names do not occur in the generated editor source map's module list; they were not silently treated as a clean upstream audit. No forced major-version tooling upgrades were applied.
- Upstream Rollup emitted existing Sass legacy API, circular dependency and top-level `this` warnings; the build completed successfully.

Portable executable: 13,543,936 bytes, SHA-256:

```text
82915CECEDDD7AA8C4B9B0BAEAC1F5A3BDBA1B1CB92273E5DC450DF3DC212D48
```

NSIS installer: 6,162,498 bytes, SHA-256:

```text
C4F9CF8F04190F65123C555A31B491D6FB82623A532248FEA2942AEF8D68CFEE
```

Versioned copies in `../release-desktop-viewer` matched their original build-output hashes. Older release artifacts were preserved.
