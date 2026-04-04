import { access, cp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');
const editorDir = path.join(publicDir, 'editor');
const upstreamDistDir = path.resolve(rootDir, '..', 'scratch', 'supersplat-upstream', 'dist');

const desktopBridgeScript = `<script>
(() => {
  const params = new URLSearchParams(window.location.search);
  const streamUrl = params.get('load') ?? '';
  const sourcePath = params.get('desktopSourcePath') ?? '';
  const rawCameraPose = params.get('desktopCameraPose');
  let cameraPose = null;

  if (rawCameraPose) {
    try {
      cameraPose = JSON.parse(rawCameraPose);
    } catch {}
  }

  document.body.dataset.desktopEmbedded = 'true';
  if (sourcePath) {
    document.body.dataset.desktopSourcePath = sourcePath;
  }

  const getCameraPose = () => {
    const scene = window.scene;
    const camera = scene?.camera;
    const position = camera?.position;
    const forward = camera?.forward;
    const sceneRadius = typeof camera?.sceneRadius === 'number' ? camera.sceneRadius : null;
    const fovFactor = typeof camera?.fovFactor === 'number' ? camera.fovFactor : null;
    const distance = typeof camera?.distanceTween?.value?.distance === 'number' ? camera.distanceTween.value.distance : null;
    const serialized = camera?.docSerialize?.();
    let focalPoint = null;

    if (position && forward && sceneRadius && fovFactor && distance !== null) {
      const currentDistance = distance * sceneRadius / fovFactor;
      focalPoint = [
        position.x + forward.x * currentDistance,
        position.y + forward.y * currentDistance,
        position.z + forward.z * currentDistance
      ];
    } else if (Array.isArray(serialized?.focalPoint) && serialized.focalPoint.length === 3) {
      focalPoint = serialized.focalPoint;
    }

    if (!camera || !position || !focalPoint || focalPoint.length !== 3) {
      return null;
    }

    return {
      fov: typeof serialized.fov === 'number' ? serialized.fov : camera.fov,
      positionX: position.x,
      positionY: position.y,
      positionZ: position.z,
      targetX: focalPoint[0],
      targetY: focalPoint[1],
      targetZ: focalPoint[2]
    };
  };

  window.__desktopGetCameraPose = getCameraPose;

  const requestBackToViewer = () => {
    window.parent?.postMessage({ type: 'supersplat:back-to-viewer' }, '*');
  };

  const replaceMatchingText = () => {
    if (!streamUrl || !sourcePath || !document.body) {
      return;
    }

    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.textContent && node.textContent.includes(streamUrl)) {
        node.textContent = node.textContent.split(streamUrl).join(sourcePath);
      }
      node = walker.nextNode();
    }

    for (const element of document.querySelectorAll('[href],[title],[aria-label]')) {
      for (const attributeName of ['title', 'aria-label']) {
        const currentValue = element.getAttribute(attributeName);
        if (currentValue && currentValue.includes(streamUrl)) {
          element.setAttribute(attributeName, currentValue.split(streamUrl).join(sourcePath));
        }
      }

      const href = element.getAttribute('href');
      if (href && href.includes(streamUrl) && !element.textContent?.trim()) {
        element.textContent = sourcePath;
        element.setAttribute('title', sourcePath);
      }
    }
  };

  let stickyCameraFramesRemaining = cameraPose ? 180 : 0;
  let userMovedCamera = false;
  let successfulCameraApplications = 0;
  let sceneHooksAttached = false;

  const stopStickyCameraPose = () => {
    if (successfulCameraApplications < 1) {
      return;
    }
    userMovedCamera = true;
    stickyCameraFramesRemaining = 0;
  };

  const refreshStickyCameraPose = (frames = 120) => {
    if (!cameraPose || userMovedCamera) {
      return;
    }
    stickyCameraFramesRemaining = Math.max(stickyCameraFramesRemaining, frames);
  };

  const applyCameraPose = () => {
    if (!cameraPose || userMovedCamera || stickyCameraFramesRemaining <= 0) {
      return false;
    }

    const scene = window.scene;
    const camera = scene?.camera;
    const contentCount = scene?.contentRoot?.children?.length ?? 0;
    if (!camera?.setPose || !camera?.mainCamera || contentCount < 1) {
      return false;
    }

    const currentPosition = camera.mainCamera.getPosition?.();
    const Vec3Ctor = currentPosition?.constructor;
    if (!Vec3Ctor) {
      return false;
    }

    const position = new Vec3Ctor(cameraPose.positionX, cameraPose.positionY, cameraPose.positionZ);
    const target = new Vec3Ctor(cameraPose.targetX, cameraPose.targetY, cameraPose.targetZ);
    camera.setPose(position, target, 0);
    if (typeof cameraPose.fov === 'number' && Number.isFinite(cameraPose.fov)) {
      camera.fov = cameraPose.fov;
    }
    scene.forceRender = true;
    stickyCameraFramesRemaining -= 1;
    successfulCameraApplications += 1;
    return true;
  };

  const ensureSceneHooks = () => {
    if (sceneHooksAttached) {
      return;
    }

    const scene = window.scene;
    const camera = scene?.camera;
    const events = scene?.events;
    if (!scene || !camera || !events?.on) {
      return;
    }

    sceneHooksAttached = true;

    events.on('scene.boundChanged', () => {
      refreshStickyCameraPose(120);
      applyCameraPose();
    });

    if (typeof camera.docDeserialize === 'function') {
      const originalDocDeserialize = camera.docDeserialize.bind(camera);
      camera.docDeserialize = (settings) => {
        const result = originalDocDeserialize(settings);
        refreshStickyCameraPose(160);
        applyCameraPose();
        return result;
      };
    }
  };

  const tryApplyCameraPose = () => {
    ensureSceneHooks();
    applyCameraPose();
  };

  const applyDesktopOverrides = () => {
    replaceMatchingText();
    tryApplyCameraPose();
  };

  const injectViewerButton = () => {
    const menuBarOptions = document.getElementById('menu-bar-options');
    if (!menuBarOptions || menuBarOptions.querySelector('.supersplat-desktop-viewer-button')) {
      return;
    }

    const menuOptions = menuBarOptions.querySelectorAll('.menu-option');
    const templateButton = menuOptions[0];
    const button = templateButton ? templateButton.cloneNode(true) : document.createElement('div');
    button.classList.add('supersplat-desktop-viewer-button');
    button.classList.remove('active', 'selected');
    button.textContent = 'Viewer';
    button.setAttribute('title', 'Viewer');
    button.setAttribute('aria-label', 'Viewer');
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      requestBackToViewer();
    });

    const insertBeforeNode = menuOptions.length >= 4 ? menuOptions[3] : null;
    menuBarOptions.insertBefore(button, insertBeforeNode);
  };

  const observer = new MutationObserver(() => {
    applyDesktopOverrides();
    injectViewerButton();
  });

  const beginWatching = () => {
    if (!document.body) {
      return;
    }

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: ['title', 'aria-label']
    });
    applyDesktopOverrides();
    injectViewerButton();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', beginWatching, { once: true });
  } else {
    beginWatching();
  }

  window.addEventListener('pointerdown', stopStickyCameraPose, { capture: true, passive: true });
  window.addEventListener('wheel', stopStickyCameraPose, { capture: true, passive: true });
  window.addEventListener('touchstart', stopStickyCameraPose, { capture: true, passive: true });

  let rafAttempts = 0;
  const tick = () => {
    applyDesktopOverrides();
    injectViewerButton();
    rafAttempts += 1;
    if (
      ((cameraPose && !userMovedCamera && stickyCameraFramesRemaining > 0) || sourcePath) &&
      rafAttempts < 600
    ) {
      window.requestAnimationFrame(tick);
    }
  };
  window.requestAnimationFrame(tick);
})();
</script>`;

const assertUpstreamBuildExists = async () => {
  try {
    await access(path.join(upstreamDistDir, 'index.html'));
    await access(path.join(upstreamDistDir, 'index.js'));
  } catch {
    throw new Error(
      [
        'Upstream SuperSplat editor build was not found.',
        `Expected files under: ${upstreamDistDir}`,
        'Build it first in scratch/supersplat-upstream via "npm install" and "npm run build".'
      ].join(' ')
    );
  }
};

const patchIndexHtml = async () => {
  const indexHtmlPath = path.join(editorDir, 'index.html');
  const original = await readFile(indexHtmlPath, 'utf8');
  const withoutServiceWorker = original.replace(/\s*<!-- Service worker -->[\s\S]*?<\/script>\s*/i, '\n');
  const retitled = withoutServiceWorker.replace('<title>SuperSplat</title>', '<title>SuperSplat Editor</title>');
  const withDesktopBridge = retitled.replace('</body>', `  ${desktopBridgeScript}\n</body>`);
  await writeFile(indexHtmlPath, withDesktopBridge, 'utf8');
};

const removeIfExists = async (targetPath) => {
  try {
    await unlink(targetPath);
  } catch {}
};

const trimEditorAssets = async () => {
  await removeIfExists(path.join(editorDir, 'index.js.map'));
  await removeIfExists(path.join(editorDir, 'sw.js'));
  await removeIfExists(path.join(editorDir, 'sw.js.map'));
  await removeIfExists(path.join(editorDir, 'static', 'images', 'screenshot-wide.jpg'));
  await removeIfExists(path.join(editorDir, 'static', 'images', 'screenshot-narrow.jpg'));

  const localesDir = path.join(editorDir, 'static', 'locales');
  const keepLocaleFiles = new Set(['en.json']);
  for (const localeName of ['de.json', 'es.json', 'fr.json', 'ja.json', 'ko.json', 'pt-BR.json', 'ru.json', 'zh-CN.json']) {
    if (!keepLocaleFiles.has(localeName)) {
      await removeIfExists(path.join(localesDir, localeName));
    }
  }
};

const main = async () => {
  await assertUpstreamBuildExists();
  await mkdir(publicDir, { recursive: true });
  await rm(editorDir, { recursive: true, force: true });
  await cp(upstreamDistDir, editorDir, { recursive: true });
  await patchIndexHtml();
  await trimEditorAssets();
};

await main();
