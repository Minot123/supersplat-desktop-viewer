# SuperSplat Desktop Viewer 3.8.0 Test

Historical notes for the isolated test build that preceded the public 3.8.0 release. For current downloads and changes, see `RELEASE_NOTES_3.8.0.md`. The isolated test executable was not a replacement for the then-published 3.5.2 release.

## Updated Components

- SuperSplat Editor 3.8.0, pinned to commit `412d1dfa585bc88b734f41006638fca6cffef4af`.
- PlayCanvas Engine 2.24.0.
- Splat-transform 3.11.1 and PCUI 6.2.0, as pinned by the editor release.
- Both primary Viewer and Editor modes continue to use the same renderer. The legacy standalone fallback has not been upgraded.

## Desktop Fixes

- Consume the new linear-opacity data without applying sigmoid a second time during GPU upload.
- Keep transparency grading and export filtering in the same linear-opacity domain.
- Reject non-finite linear opacity when exporting with invalid-data removal enabled, while retaining valid zero/one alpha decoded from PLY logits.
- Preserve above-one opacity metadata through PLY export and reload instead of silently clamping it.
- Apply the desktop SSPROJ save integration in upstream TypeScript rather than matching minifier-generated variable names.
- Reduce peak export memory by retaining immutable Blob chunks instead of concatenating a second whole-file buffer; native project saves reuse the Blob directly.
- Do not publish a partial project after aborting a download writer.
- Record the upstream modifications in a reproducible, commit-checked patch and reject stale or modified bundles using asset hashes.

## Test Isolation

- Separate application identifier and settings profile.
- Explicit TEST window title; no installer or file-association changes.
- Existing installations and previously published binaries remain untouched.
- PLY and SSPROJ round-trip checks compare rendered images at a fixed camera pose. SOG is a lossy format and has a separate comparison tolerance.

See `docs/qa-3.8.0.md` for the observed results and limitations. No GitHub release is published by preparing this build.
