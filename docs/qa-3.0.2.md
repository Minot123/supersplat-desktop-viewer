# 3.0.2 verification

Tested the production frontend in headless Microsoft Edge with WebGPU and a generated 64-Gaussian PLY served over localhost. Tauri IPC was mocked; application restart was simulated by reloading the top-level document in the same browser context, retaining localStorage.

1. Seeded storage with a colored background, ACES, FOV 110, Fly controls, nonzero initial camera coordinates and fallback performance mode.
2. Started the application: observed black background, Linear, FOV 75, Orbit and initial position approximately (0, 0, 0), target (0, 0, 1).
3. In Editor changed the background to (0.2, 0.4, 0.8), tone mapping to ACES and FOV to 105. Verified that these values were written to the editor preference store.
4. Returned to Viewer: all three settings remained unchanged during the current run.
5. Reloaded the application without clearing browser data: observed the defaults again. An unrelated test storage key remained intact.

No JavaScript page errors occurred. Scene documents and native WebView2 startup were not modified or exercised by this browser test.

Automated regression: `node scripts/verify-startup-preferences.mjs`. Existing mode-switch and loading lifecycle tests also pass.
