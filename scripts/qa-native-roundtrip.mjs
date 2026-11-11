import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const qaRequire = createRequire(path.join(root, 'scratch/browser-qa/verify-upgrade.cjs'));
const { chromium } = qaRequire('playwright');
const output = await fs.mkdtemp(path.join(root, 'scratch/qa-3.8.0-'));
console.log(`QA output: ${output}`);
const names = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
const count = 4096;
const header = Buffer.from(`ply\nformat binary_little_endian 1.0\ncomment SplatRenderMode: mip\nelement vertex ${count}\n${names.map(n => `property float ${n}`).join('\n')}\nend_header\n`);
const body = Buffer.alloc(count * names.length * 4);
for (let i = 0; i < count; i++) {
  const x = (i % 64) / 63;
  const y = Math.floor(i / 64) / 63;
  const alpha = 0.02 + 0.96 * x;
  const dc = rgb => (rgb - 0.5) / 0.28209479177387814;
  const row = [x * 2 - 1, y * 2 - 1, 3 + Math.sin(x * 6) * 0.1, dc(x), dc(y), dc(0.7), Math.log(alpha / (1 - alpha)), -3.7, -3.7, -3.7, 1, 0, 0, 0];
  row.forEach((v, j) => body.writeFloatLE(v, (i * names.length + j) * 4));
}
const fixture = process.env.SOURCE_FILE ? path.resolve(process.env.SOURCE_FILE) : path.join(output, 'opacity-gradient.ply');
if (!process.env.SOURCE_FILE) await fs.writeFile(fixture, Buffer.concat([header, body]), { flag: 'wx' });
let ready = false;
for (let attempt = 0; attempt < 60 && !ready; attempt++) {
  try {
    const targets = await (await fetch('http://127.0.0.1:9238/json')).json();
    ready = targets.some(target => target.url?.startsWith('http://tauri.localhost/'));
  } catch { /* Native WebView may still be starting. */ }
  if (!ready) await new Promise(resolve => setTimeout(resolve, 500));
}
assert.ok(ready, 'Native test WebView did not start within 30 seconds');
const browser = await chromium.connectOverCDP('http://127.0.0.1:9238');
const page = browser.contexts()[0].pages().find(p => p.url().startsWith('http://tauri.localhost/'));
assert.ok(page, 'Native Tauri WebView must be running');
const errors = [];
const versions = [];
const results = [];
const visualFailures = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('crash', () => { errors.push('WebView renderer crashed'); console.error('WebView renderer crashed'); });
page.on('close', () => console.error('WebView page closed'));
page.on('console', m => {
  if (m.text().startsWith('SuperSplat v')) versions.push(m.text());
  if (m.type() === 'error') console.error(`Browser: ${m.text()}`);
});
const cdp = await browser.contexts()[0].newCDPSession(page);
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: output, eventsEnabled: true });
let frame;
let referencePose = { position: [0, 0, 0], target: [0, 0, 3] };
let expectedCount = count;
let shBands = 0;
const open = async (file) => {
  await page.evaluate(async filePath => {
    const payload = await window.__TAURI_INTERNALS__.invoke('resolve_file_path', { filePath });
    if (!payload) throw new Error(`Cannot resolve ${filePath}`);
    await window.__TAURI_INTERNALS__.invoke('plugin:event|emit', { event: 'file-open', payload });
  }, file);
  await page.waitForFunction(name => {
    const f = document.querySelector('iframe').contentWindow;
    return new URL(f.location.href).searchParams.get('filename') === name && f.__desktopGetSceneStats?.()?.firstFrameRendered;
  }, path.basename(file), { timeout: 180000 });
  await page.locator('#loadingOverlay').waitFor({ state: 'hidden', timeout: 30000 });
  frame = page.frames().find(f => f !== page.mainFrame());
  await frame.evaluate(() => {
    scene.events.functions.set('showPopup', async options => { throw new Error(JSON.stringify(options)); });
    scene.events.fire('view.setStochastic', 'disabled');
  });
  assert.equal((await frame.evaluate(() => window.__desktopGetSceneStats())).loadError, null);
};
const settings = async () => frame.evaluate(bands => {
  const Color = scene.events.invoke('bgClr').constructor;
  scene.events.fire('setBgClr', new Color(0.08, 0.11, 0.15, 1));
  scene.events.fire('camera.setTonemapping', 'aces2');
  scene.events.fire('view.setAntiAlias', 'on');
  scene.events.fire('view.setBands', bands);
}, shBands);
const capture = async (name) => {
  // Entering Editor releases the desktop startup pose guard. Otherwise it can
  // overwrite an offscreen render's temporary FOV during the first few frames.
  if (await frame.evaluate(() => document.body.dataset.desktopViewMode !== 'editor')) {
    await page.locator('#openEditorButton').click();
    await frame.waitForFunction(() => document.body.dataset.desktopViewMode === 'editor');
  }
  const image = await frame.evaluate(async pose => {
    const Vec3 = scene.camera.position.constructor;
    const options = { width: 640, height: 480, format: 'png', fov: 60, position: new Vec3(...pose.position), target: new Vec3(...pose.target), orthographic: false };
    // Settle the offscreen target after camera/view changes before measuring.
    // The independent repeat-render assertion still enforces the same tolerance.
    await editor.viewport.render(options);
    await editor.viewport.render(options);
    const result = await editor.viewport.render(options);
    return result.image;
  }, referencePose);
  assert.equal(image.mimeType, 'image/png');
  await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(image.data, 'base64'));
  return image.data;
};
const snapshot = async (name) => {
  const data = await frame.evaluate(() => {
    const splat = scene.events.invoke('scene.allSplats')[0];
    const grades = Array.from({ length: splat.colorPalette.size }, (_, i) => splat.colorPalette.getEntry(i, { m: Array(9).fill(0), offset: { r: 0, g: 0, b: 0 }, transparency: 1 }));
    return {
      camera: scene.camera.docSerialize(), view: scene.events.invoke('docSerialize.view'),
      stochastic: scene.events.invoke('view.stochastic'), sortMode: scene.events.invoke('view.sortMode'),
      transform: Array.from(splat.entity.getWorldTransform().data), grades,
      sourceModel: splat.resource.source.meta.model, resourceModel: splat.resource.model,
      preview: { tint: splat.tintClr, saturation: splat.saturation, transparency: splat.transparency },
      sampleInstances: Array.from({ length: 5 }, (_, i) => ({ row: splat.instances.sourceRow[i], color: splat.instances.colorIndex(i), transform: splat.instances.transformIndex(i) }))
    };
  });
  await fs.writeFile(path.join(output, `${name}.json`), JSON.stringify(data, null, 2));
  return data;
};
const compare = async (before, after) => page.evaluate(async ({ before, after }) => {
  const pixels = async data => {
    const bitmap = await createImageBitmap(new Blob([Uint8Array.from(atob(data), c => c.charCodeAt(0))], { type: 'image/png' }));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    return ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  };
  const a = await pixels(before), b = await pixels(after);
  let sum = 0, square = 0, max = 0, signed = 0, changed = 0, minValue = 255, maxValue = 0;
  for (let i = 0; i < a.length; i++) {
    if (i % 4 === 3) continue;
    const d = Math.abs(a[i] - b[i]);
    sum += d; square += d * d; signed += b[i] - a[i]; max = Math.max(max, d);
    if (d) changed++;
    minValue = Math.min(minValue, a[i]); maxValue = Math.max(maxValue, a[i]);
  }
  const n = a.length * 3 / 4;
  return { meanAbsolute: sum / n, rmse: Math.sqrt(square / n), meanSigned: signed / n, maximum: max, changedChannels: changed, referenceRange: maxValue - minValue };
}, { before, after });
const exportScene = async (format, name) => {
  console.log(`${new Date().toISOString()} Exporting ${format}, SH${shBands}`);
  const pending = page.waitForEvent('download', { timeout: 600000 });
  const [ok, download] = await Promise.all([
    frame.evaluate(async ({ format, name, shBands }) => scene.events.invoke('scene.write', format, { filename: name, splatIdx: 'all', serializeSettings: { shBands }, sogIterations: 1 }), { format, name, shBands }),
    pending
  ]);
  assert.equal(ok, true);
  assert.equal(await download.failure(), null);
  assert.equal(download.suggestedFilename(), name);
  console.log(`${new Date().toISOString()} Exported ${format}`);
  return path.join(output, name);
};
try {
  await page.goto('http://tauri.localhost/');
  await page.waitForLoadState('networkidle');
  await open(fixture);
  expectedCount = (await frame.evaluate(() => __desktopGetSceneStats())).numSplats;
  shBands = await frame.evaluate(() => scene.events.invoke('scene.allSplats')[0].resource.shBands);
  assert.ok(versions.some(v => v.includes('v3.8.0') && v.includes('Engine v2.24.0') && v.includes('SplatTransform v3.11.1')), versions.join('\n'));
  assert.equal(await page.locator('#cameraPanel').isVisible(), false);
  assert.equal(await frame.evaluate(() => scene.events.invoke('camera.controlMode')), 'orbit');
  assert.equal(await frame.evaluate(() => scene.camera.renderOverlays), false);
  await page.locator('#togglePanelButton').click();
  await page.locator('#modelRotationXNumber').fill('23');
  await page.locator('#modelRotationXNumber').press('Tab');
  assert.ok(Math.abs((await frame.evaluate(() => __desktopGetSceneTransform())).rotationX - 23) < 0.01);
  await page.locator('#cameraFovNumber').fill('105');
  await page.locator('#cameraFovNumber').press('Tab');
  const poseBefore = await frame.evaluate(() => { window.__qaScene = scene; return __desktopGetCameraPose(); });
  assert.equal(poseBefore.fov, 105);
  for (let i = 0; i < 3; i++) {
    await page.locator('#openEditorButton').click();
    await frame.waitForFunction(() => document.body.dataset.desktopViewMode === 'editor');
    await frame.locator('.supersplat-desktop-viewer-button').click();
    await frame.waitForFunction(() => document.body.dataset.desktopViewMode === 'viewer');
  }
  assert.equal(await frame.evaluate(() => scene === window.__qaScene), true, 'Mode changes must reuse the scene');
  const poseAfter = await frame.evaluate(() => __desktopGetCameraPose());
  for (const key of Object.keys(poseBefore)) assert.ok(Math.abs(poseBefore[key] - poseAfter[key]) < 0.001, `Camera changed on mode switch: ${key}`);
  await page.locator('#resetViewButton').click();
  assert.ok(Math.abs((await frame.evaluate(() => __desktopGetSceneTransform())).rotationX) < 0.01);
  await page.locator('#togglePanelButton').click();
  await page.locator('#openEditorButton').click();
  await frame.waitForFunction(() => document.body.dataset.desktopViewMode === 'editor');
  if (process.env.SOURCE_FILE) {
    referencePose = await frame.evaluate(() => {
      const b = scene.bound, c = b.center, d = Math.max(b.halfExtents.length() * 2.2, 1);
      return { position: [c.x, c.y, c.z - d], target: [c.x, c.y, c.z] };
    });
  }
  await settings();
  await frame.evaluate(async () => {
    const Color = scene.events.invoke('bgClr').constructor;
    const splat = scene.events.invoke('scene.allSplats')[0];
    await editor.color.apply({ tintClr: new Color(0.9, 0.8, 1), temperature: 0, saturation: 0.8, brightness: 0.02, blackPoint: 0, whitePoint: 1, transparency: 0.5 }, splat.uid, 'layer');
  });
  const before = await capture('before-save');
  const beforeState = await snapshot('before-state');
  const unchanged = await compare(before, await capture('repeat-render'));
  await frame.evaluate(() => scene.events.fire('view.setBands', 0));
  const beforeSH0 = await capture('before-save-sh0');
  await frame.evaluate(bands => scene.events.fire('view.setBands', bands), shBands);
  assert.ok(unchanged.referenceRange > 30, 'Reference must contain visible geometry, not a blank frame');
  assert.ok(unchanged.meanAbsolute < 0.01, `Non-deterministic baseline: ${JSON.stringify(unchanged)}`);
  const reuse = process.env.REUSE_EXPORTS;
  const ply = reuse ? path.join(reuse, 'roundtrip.ply') : await exportScene('ply', 'roundtrip.ply');
  const sog = reuse ? path.join(reuse, 'roundtrip.sog') : await exportScene('sog', 'roundtrip.sog');
  await frame.evaluate(() => {
    window.showDirectoryPicker = undefined;
    scene.events.functions.set('show.savePopup', async () => ({ filename: 'roundtrip.ssproj' }));
  });
  const project = path.join(output, 'roundtrip.ssproj');
  if (reuse && !process.env.REFRESH_PROJECT) await fs.copyFile(path.join(reuse, 'roundtrip.ssproj'), project);
  else {
    const [, download] = await Promise.all([
      frame.evaluate(() => scene.events.invoke('doc.saveAs')),
      page.waitForEvent('download', { timeout: 600000 })
    ]);
    assert.equal(await download.failure(), null);
  }
  // SH packing varies slightly across resource reloads. Keep the alpha/DC
  // comparison strict, while allowing <0.05 of one 8-bit level for SH color.
  const stableTolerance = shBands > 0 ? 0.05 : 0.01;
  for (const [format, file, tolerance] of [['ply', ply, 0.1], ['sog', sog, 3], ['ssproj', project, stableTolerance]]) {
    await open(file);
    if (format !== 'ssproj') await settings();
    const image = await capture(`reopened-${format}`);
    const state = await snapshot(`reopened-${format}-state`);
    const delta = await compare(before, image);
    await frame.evaluate(() => scene.events.fire('view.setBands', 0));
    const deltaSH0 = await compare(beforeSH0, await capture(`reopened-${format}-sh0`));
    await frame.evaluate(bands => scene.events.fire('view.setBands', bands), shBands);
    const stats = await frame.evaluate(() => __desktopGetSceneStats());
    console.log(JSON.stringify({ format, delta, deltaSH0, stats }));
    if (format === 'sog' && process.env.SOURCE_FILE) assert.ok(stats.numSplats > 0 && stats.numSplats <= expectedCount);
    else assert.equal(stats.numSplats, expectedCount);
    if (delta.meanAbsolute > tolerance) visualFailures.push(`${format} visual drift: ${JSON.stringify(delta)}`);
    if (format === 'ssproj') {
      if (deltaSH0.meanAbsolute > 0.01) visualFailures.push(`Project alpha/DC drift: ${JSON.stringify(deltaSH0)}`);
      for (const key of ['camera', 'view', 'transform', 'grades', 'sourceModel', 'resourceModel']) {
        assert.deepEqual(state[key], beforeState[key], `Project ${key} changed`);
      }
    }
    results.push({ format, bytes: (await fs.stat(file)).size, delta, deltaSH0, stats });
    if (format === 'ply' && !process.env.DIAGNOSTIC_ONLY) {
      const second = await exportScene('ply', 'roundtrip-second.ply');
      await open(second); await settings();
      const secondDelta = await compare(image, await capture('ply-second-reopen'));
      if (secondDelta.meanAbsolute > stableTolerance) visualFailures.push(`Second PLY save drifts: ${JSON.stringify(secondDelta)}`);
      results.push({ format: 'ply-second', delta: secondDelta });
    }
    if (format === 'ssproj' && !process.env.DIAGNOSTIC_ONLY) {
      const view = await frame.evaluate(() => scene.events.invoke('docSerialize.view'));
      assert.deepEqual(view.bgColor, [0.08, 0.11, 0.15, 1]);
      assert.equal(await frame.evaluate(() => scene.events.invoke('view.antiAlias')), 'on');
      assert.equal(await frame.evaluate(() => scene.events.invoke('camera.tonemapping')), 'aces2');
      await frame.evaluate(() => {
        scene.events.functions.set('show.savePopup', async () => ({ filename: 'roundtrip.ssproj' }));
      });
      const oldMtime = (await fs.stat(project)).mtimeMs;
      await frame.evaluate(() => scene.events.invoke('doc.saveAs'));
      assert.ok((await fs.stat(project)).mtimeMs > oldMtime, 'Native project PUT must complete');
      await open(project);
      const secondImage = await capture('ssproj-second-reopen');
      const delta2 = await compare(image, secondImage);
      const totalDelta = await compare(before, secondImage);
      if (delta2.meanAbsolute > stableTolerance || totalDelta.meanAbsolute > stableTolerance) visualFailures.push(`Second project save drifts: ${JSON.stringify({ delta2, totalDelta })}`);
      results.push({ format: 'ssproj-second-native-put', delta: delta2, totalDelta });
    }
  }
  await frame.locator('.supersplat-desktop-viewer-button').click();
  await frame.waitForFunction(() => document.body.dataset.desktopViewMode === 'viewer');
  await page.screenshot({ path: path.join(output, 'viewer-ui.png') });
  await page.locator('#openEditorButton').click();
  await frame.waitForFunction(() => document.body.dataset.desktopViewMode === 'editor');
  await page.screenshot({ path: path.join(output, 'editor-ui.png') });
  assert.deepEqual(errors, []);
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify({ versions, unchanged, results, errors, visualFailures }, null, 2));
  assert.deepEqual(visualFailures, []);
  console.log(`PASS native round trips: ${output}`);
} catch (error) {
  await page.screenshot({ path: path.join(output, 'failure.png') }).catch(() => {});
  await fs.writeFile(path.join(output, 'failure.json'), JSON.stringify({ error: String(error), versions, results, errors }, null, 2));
  throw error;
} finally { await browser.close(); }
