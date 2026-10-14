# Upstream Build And Versioning

The desktop version follows the stable SuperSplat Editor tag, not the engine's independent version series. The current desktop and editor version is 3.5.2; the shared main Viewer/Editor renderer uses PlayCanvas 2.23.2.

`upstream-versions.json` records the editor tag/commit, engine override and splat-transform version. Update this file deliberately when adopting a new release; normal builds do not query the network for a newer tag.

## Editor Build

The upstream checkout must be at `../scratch/supersplat-upstream` relative to this repository. Inspect its working tree before switching tags; preserve unrelated local changes.

For a fresh checkout, run from the repository root:

```powershell
git clone --branch v3.5.2 https://github.com/playcanvas/supersplat.git ../scratch/supersplat-upstream
```

Then, inside that checkout:

```powershell
git rev-parse HEAD
# Expected: f2a1b4975b4766e0ee0c95e63c2737dc2ecb6e5b
npm ci
npm install --save-dev --save-exact playcanvas@2.23.2
npm run build
```

The official editor tag pins Engine 2.23.0. This desktop build deliberately overrides it with stable Engine 2.23.2. The editor's other runtime dependencies retain their upstream versions, including splat-transform 3.9.0. Engine override changes in the scratch checkout's package manifests are expected.

## Desktop Build

From this repository:

```powershell
npm ci
npm run version:sync
npm run dist
```

Version synchronization updates package.json, package-lock.json, Cargo.toml, Cargo.lock and tauri.conf.json. It is idempotent and runs before Tauri reads its configuration. Editor preparation rejects mismatched package versions and stale bundles that do not contain the pinned editor/engine versions.

Do not use independent patch/minor/major increments for desktop release names. Desktop-only changes should be described in release notes without inventing a different upstream version. Preserve previously published binaries; do not silently replace an existing release asset with a different build under the same filename. A future policy for multiple public desktop revisions of the same editor version needs an explicit decision.

The legacy standalone viewer dependency remains at 1.31.2. Its separate renderer is not used for the main Viewer or Editor modes. Migrating that fallback to the new standalone createViewer API is separate work, not required for updating the shared editor renderer.
