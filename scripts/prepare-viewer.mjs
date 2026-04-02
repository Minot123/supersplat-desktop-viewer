import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');
const viewerDir = path.join(publicDir, 'viewer');
const licensesDir = path.join(publicDir, 'licenses');

const viewerEntryUrl = import.meta.resolve('@playcanvas/supersplat-viewer');
const viewerEntry = fileURLToPath(viewerEntryUrl);
const viewerPackageDir = path.resolve(path.dirname(viewerEntry), '..');
const viewerPublicDir = path.join(viewerPackageDir, 'public');

const extractViewerBody = (htmlSource) => {
  const bodyMatch = htmlSource.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!bodyMatch) {
    throw new Error('Unable to extract viewer body from upstream html');
  }

  return bodyMatch[1].replace(/<script\b[\s\S]*?<\/script>\s*$/i, '').trim();
};

const patchViewerScript = (scriptSource) => {
  const originalSnippet = `const loadGsplat = async (app, config, progressCallback) => {
    const { contents, contentUrl, unified, aa } = config;
    const c = contents;
    const filename = new URL(contentUrl, location.href).pathname.split('/').pop();
    const data = filename.toLowerCase() === 'meta.json' ? await (await contents).json() : undefined;
    const asset = new Asset(filename, 'gsplat', { url: contentUrl, filename, contents: c }, data);`;

  const patchedSnippet = `const loadGsplat = async (app, config, progressCallback) => {
    const { contents, contentUrl, unified, aa, reorder } = config;
    const c = contents;
    const filename = new URL(contentUrl, location.href).pathname.split('/').pop();
    const data = filename.toLowerCase() === 'meta.json' ? await (await contents).json() : {};
    if (data && data.reorder === undefined) {
        data.reorder = reorder ?? true;
    }
    const asset = new Asset(filename, 'gsplat', { url: contentUrl, filename, contents: c }, data);`;

  if (!scriptSource.includes(originalSnippet)) {
    throw new Error('Unable to patch upstream viewer index.js: loadGsplat signature not found');
  }

  return scriptSource.replace(originalSnippet, patchedSnippet);
};

const defaultSettings = {
  annotations: [],
  animTracks: [],
  background: {
    color: [0, 0, 0]
  },
  cameras: [],
  highPrecisionRendering: false,
  postEffectSettings: {
    bloom: { blurLevel: 0, enabled: false, intensity: 0 },
    fringing: { enabled: false, intensity: 0 },
    grading: { brightness: 0, contrast: 1, enabled: false, saturation: 1, tint: [1, 1, 1] },
    sharpness: { amount: 0, enabled: false },
    vignette: { curvature: 0, enabled: false, inner: 0, intensity: 0, outer: 1 }
  },
  startMode: 'default',
  tonemapping: 'aces2',
  version: 2
};

await rm(viewerDir, { recursive: true, force: true });
await mkdir(viewerDir, { recursive: true });
await mkdir(licensesDir, { recursive: true });

const patchedViewerScript = patchViewerScript(await readFile(path.join(viewerPublicDir, 'index.js'), 'utf8'));

await Promise.all([
  copyFile(path.join(viewerPublicDir, 'index.css'), path.join(viewerDir, 'index.css')),
  copyFile(path.join(viewerPackageDir, 'LICENSE'), path.join(licensesDir, 'supersplat-viewer-LICENSE.txt'))
]);
await writeFile(path.join(viewerDir, 'index.js'), patchedViewerScript, 'utf8');

const upstreamViewerHtml = await readFile(path.join(viewerPublicDir, 'index.html'), 'utf8');
await writeFile(path.join(viewerDir, 'index.html'), upstreamViewerHtml, 'utf8');
await writeFile(path.join(viewerDir, 'viewer-body.html'), extractViewerBody(upstreamViewerHtml), 'utf8');
await writeFile(path.join(viewerDir, 'settings.json'), JSON.stringify(defaultSettings, null, 2), 'utf8');
