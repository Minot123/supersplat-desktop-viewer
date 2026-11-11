# 3.8.0 Publication Review

Reviewed on 2026-11-11 before publishing the public repository update and Windows packages. This is a targeted confidentiality/release review, not a penetration test or a guarantee against all vulnerabilities.

## Confidentiality

- Gitleaks 8.30.1 scanned all 17 existing Git commits with redacted reporting: no detected secrets.
- The candidate source tree and packaged frontend assets were scanned locally, without uploading source files or models to a scanning service.
- One frontend finding was the PlayCanvas assignment `this.radixSort.sortedKeys,d=this.radixSort.sortedIndices;`, not a credential. `.gitleaks.toml` permits only this assignment pattern, not a whole file or secret rule.
- Private model names and identifying checksums were removed from the current QA documents. Model files, generated exports, screenshots, logs, crash dumps, WebView profiles and credentials are not release assets or committed sources.
- Public executables are rebuilt with neutral Rust path prefixes and a filename-only PDB reference. ASCII and UTF-16 checks reject local profile/project paths and absolute PDB paths. No PDB files or editor source maps are packaged.
- The NSIS installer was extracted successfully. Its application payload matches the portable EXE byte-for-byte after accounting for Tauri's expected `UNK` versus `NSS` bundle-type marker.
- Printable ASCII/UTF-16 strings from the extracted application EXE and five installer DLLs were checked for private identifiers and scanned with Gitleaks: no detected secrets or private identifiers. Raw binary files are not treated as scanned merely because Gitleaks skips binary input.
- Git uses the existing GitHub noreply author address, not a personal email address.

Previously published commits and release binaries were not rewritten or replaced. Historical commits can still contain older QA fixture names/checksums, and older executables can retain compiler source paths. Sanitizing the current tree does not erase previously public metadata.

## Dependency Scope

- Desktop npm dependencies, including build dependencies: zero reported advisories after updating Vite to 6.4.6.
- The pinned upstream Editor development tree reports 19 affected packages: 6 high, 10 moderate and 3 low. None of those package names occur in the 1,190 source-map module entries inspected for the editor bundle. They are development/build-tool findings, not a clean upstream audit.
- Upstream lists runtime libraries under `devDependencies`, so `npm audit --omit=dev` alone is not evidence of runtime safety. The full audit and generated bundle module list were compared.
- No forced major-version upgrades of upstream tools were made. Rust dependencies did not change in this release other than the application's version; a full Rust advisory audit is outside this review.
- Executables are not Authenticode-signed. SHA-256 checksums provide download-integrity verification, not publisher authentication.

## Final Verification

- 43 upstream tests and upstream ESLint passed.
- All 12 desktop `verify-*.mjs` suites and TypeScript checking passed.
- All 10 Rust library tests passed, including the local HTTP connection/range handling regressions.
- The final public portable EXE completed native PLY, SOG and SSPROJ save/reopen tests on the generated 4,096-splat gradient, including second PLY and native project-save cycles, with no page errors or visual-test failures.
- The first final-package run stopped before export because its first two offscreen baseline frames differed by 0.0358/255. Repeated steady-state frames differed by less than 0.0005/255. The harness now renders two warm-up frames after view changes, retains the independent repeat-render assertion and does not relax comparison thresholds. The complete rerun passed; the failed run remains in local evidence.
- Large-scene round-trip results for the same editor/render/export code are recorded separately in `qa-3.8.0.md`. The final packaging pass changed path metadata, frontend build tooling and debug-map inclusion; it did not repeat the 3-million-splat stress run.

## Artifacts

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `SuperSplat.Desktop.Viewer_3.8.0_portable.exe` | 11994112 | `6c6f2beb2476d5589195746b9413605a11549f22a2efb65cf3d5a3bd5b02c439` |
| `SuperSplat.Desktop.Viewer_3.8.0_x64-setup.exe` | 4602190 | `779675261c48171b821512f2d3f4fb244f3e674927298ecf1ad00037a9c5594b` |
