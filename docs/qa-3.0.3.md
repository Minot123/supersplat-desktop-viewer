# 3.0.3 export verification

Tested on Windows in the native Tauri/WebView2 application with an isolated QA profile. Playwright connected over CDP to the real desktop application; Tauri file-open IPC and the local HTTP server were not mocked. Export was invoked through the editor's `scene.write` handler, including its browser download writer.

## Reproduction

- Source: `kalyazin.ply`, binary little-endian PLY, 3,000,000 Gaussians, SH degree 3, 744,001,762 bytes.
- Installed 3.0.2 failed during PLY export at approximately 247,465,414 output bytes after 31.3 seconds. Chromium reported `net::ERR_NO_BUFFER_SPACE`.
- The local server closed every range request's TCP connection. Windows showed 13,319 localhost sockets in TIME_WAIT; the configured ephemeral TCP range contained 16,384 ports.
- The error was therefore reproduced with the original file still present and readable. It was not caused by a renamed or missing source file.

## Fixed Export And Round Trip

- A 3.0.3 keep-alive verification run completed PLY serialization with 26,546 scene requests using only two TCP connections. No fetch errors were reported.
- A subsequent real PLY download completed in approximately 72.2 seconds and produced 708,001,478 bytes. The exporter omits the source's normal properties.
- The final 3.0.3 build completed SOG serialization in approximately 272.3 seconds and saved a 40,570,925-byte file. Settings: SH degree 3, one SOG compression iteration, upstream low-opacity and invalid-data filtering enabled. This is not a benchmark of the default ten-iteration setting.
- The SOG download observer missed the download event after a second CDP connection was used for progress inspection. The file was found in the standard Downloads folder, copied to the isolated QA output folder and verified independently. This harness issue did not produce an application export error.
- Both exported files were reopened through native file-open IPC in the final 3.0.3 build. PLY: 3,000,000 Gaussians; SOG: 2,994,508 Gaussians after the enabled export filtering. Both reported `firstFrameRendered: true` and `loadError: null`.
- An earlier SOG attempt was interrupted by the user closing the test window; it was not an application crash.

The source was read only. Its size, modification time and SHA-256 remained unchanged:

```text
EABEA2801D91317AC0EF75B65960B0FA8461F724D400521157F01A6067ABF435
```

The exported SOG SHA-256 is:

```text
5F4ABE8763416D296ADC747D2E43E784C9A8C24922F42940685CD94E15083238
```

## Automated Checks And Packaging

- `cargo test --release --lib`: 10 tests passed, including persistent connections, ranges, HEAD, explicit close, HTTP/1.0, ambiguous request framing and truncated source responses.
- All seven `scripts/verify-*.mjs` regression checks passed.
- `npm run typecheck` and `git diff --check` passed.
- `scripts/run-tauri.cmd build` completed successfully, including the NSIS installer.
- Versioned portable executable: 13,439,488 bytes; installer: 6,061,031 bytes. Copied artifacts matched their build-output hashes and reported version 3.0.3.

The installed application was not replaced, and no GitHub release was published during this verification. Rendering, editor dependencies and initial-load performance were not changed by this fix.
