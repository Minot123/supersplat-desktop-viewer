import { access, cp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import packageJson from '../package.json' with { type: 'json' };

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(rootDir, 'public');
const editorDir = path.join(publicDir, 'editor');
const upstreamDistDir = path.resolve(rootDir, '..', 'scratch', 'supersplat-upstream', 'dist');

const desktopBridgeScript = `<script>
(() => {
  void navigator.serviceWorker?.getRegistrations?.().then((registrations) => {
    for (const registration of registrations) {
      void registration.unregister();
    }
  }).catch(() => {});

  void window.caches?.keys?.().then((keys) => {
    for (const key of keys) {
      void window.caches.delete(key);
    }
  }).catch(() => {});

  const params = new URLSearchParams(window.location.search);
  const streamUrl = params.get('load') ?? '';
  const sourcePath = params.get('desktopSourcePath') ?? '';
  const desktopViewMode = params.get('desktopViewMode') ?? 'editor';
  const desktopProjectName = sourcePath.replace(/\\\\/g, '/').split('/').filter(Boolean).pop() || 'scene.ssproj';
  const rawCameraPose = params.get('desktopCameraPose');
  const rawSceneTransform = params.get('desktopSceneTransform');
  let cameraPose = null;
  let sceneTransform = null;

  if (rawCameraPose) {
    try {
      cameraPose = JSON.parse(rawCameraPose);
    } catch {}
  }

  if (rawSceneTransform) {
    try {
      sceneTransform = JSON.parse(rawSceneTransform);
    } catch {}
  }

  document.body.dataset.desktopEmbedded = 'true';
  document.body.dataset.desktopViewMode = desktopViewMode;
  if (sourcePath) {
    document.body.dataset.desktopSourcePath = sourcePath;
  }

  if (desktopViewMode === 'viewer') {
    const style = document.createElement('style');
    const hiddenChromeSelectors = [
      'body[data-desktop-view-mode="viewer"] #app-container > :not(#editor-container)',
      'body[data-desktop-view-mode="viewer"] #main-container > :not(#canvas-container)',
      'body[data-desktop-view-mode="viewer"] #canvas-container > :not(canvas):not(#canvas)',
      'body[data-desktop-view-mode="viewer"] #menu',
      'body[data-desktop-view-mode="viewer"] #menu-bar',
      'body[data-desktop-view-mode="viewer"] #top-container',
      'body[data-desktop-view-mode="viewer"] #tools-container',
      'body[data-desktop-view-mode="viewer"] #bottom-toolbar',
      'body[data-desktop-view-mode="viewer"] #color-panel',
      'body[data-desktop-view-mode="viewer"] #data-panel',
      'body[data-desktop-view-mode="viewer"] #cursor-label',
      'body[data-desktop-view-mode="viewer"] #app-label',
      'body[data-desktop-view-mode="viewer"] #tooltips-container',
      'body[data-desktop-view-mode="viewer"] .supersplat-desktop-viewer-button',
      'body[data-desktop-view-mode="viewer"] .pcui-tooltip'
    ];
    const fullscreenSelectors = [
      'body[data-desktop-view-mode="viewer"] #app-container',
      'body[data-desktop-view-mode="viewer"] #editor-container',
      'body[data-desktop-view-mode="viewer"] #main-container',
      'body[data-desktop-view-mode="viewer"] #canvas-container'
    ];
    style.textContent = [
      hiddenChromeSelectors.join(',\\n') + ' { display: none !important; }',
      fullscreenSelectors.join(',\\n') + ' { inset: 0 !important; }',
      'body[data-desktop-view-mode="viewer"] #canvas { display: block !important; width: 100% !important; height: 100% !important; }'
    ].join('\\n');
    document.head.appendChild(style);
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

  const nativeShowSaveFilePicker = window.showSaveFilePicker?.bind(window);

  const isSsprojSaveOptions = (options) => {
    const types = Array.isArray(options?.types) ? options.types : [];
    return types.some((type) => {
      const accept = type?.accept ?? {};
      return Object.values(accept).some((extensions) => (
        Array.isArray(extensions) &&
        extensions.some((extension) => String(extension).toLowerCase() === '.ssproj')
      ));
    });
  };

  const toUint8Array = async (value) => {
    if (typeof value === 'string') {
      return new TextEncoder().encode(value);
    }
    if (value instanceof Uint8Array) {
      return value;
    }
    if (ArrayBuffer.isView(value)) {
      return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    }
    if (value instanceof ArrayBuffer) {
      return new Uint8Array(value);
    }
    if (value instanceof Blob) {
      return new Uint8Array(await value.arrayBuffer());
    }
    throw new TypeError('Unsupported desktop save chunk type');
  };

  const getDesktopLoadedSplatCount = () => {
    try {
      const splats = window.scene?.events?.invoke?.('scene.allSplats') ?? [];
      return splats.reduce((total, splat) => total + (splat?.splatData?.numSplats ?? 0), 0);
    } catch {
      return 0;
    }
  };

  const assertDesktopProjectReadyToSave = () => {
    if (getDesktopLoadedSplatCount() <= 0) {
      throw new Error('Desktop project is still loading; wait until splats appear before saving.');
    }
  };

  const createDesktopSsprojWritable = () => {
    const chunks = [];
    let cursor = 0;
    let closed = false;

    return {
      async seek(position) {
        cursor = Number(position) || 0;
        if (cursor !== 0) {
          throw new Error('Desktop project save only supports sequential writes');
        }
      },
      async write(value) {
        if (closed) {
          throw new Error('Desktop project save stream is closed');
        }
        if (value?.type === 'seek') {
          await this.seek(value.position);
          return;
        }
        if (value?.type === 'truncate') {
          await this.truncate(value.size);
          return;
        }

        const payload = value?.type === 'write' ? value.data : value;
        const bytes = await toUint8Array(payload);
        chunks.push(bytes.slice());
        cursor += bytes.byteLength;
      },
      async truncate(size) {
        const nextSize = Number(size);
        if (Number.isFinite(nextSize) && nextSize < cursor) {
          cursor = nextSize;
        }
      },
      async close() {
        if (closed) {
          return;
        }
        closed = true;

        assertDesktopProjectReadyToSave();

        const blob = new Blob(chunks, { type: 'application/x-supersplat' });
        const response = await fetch(streamUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/x-supersplat' },
          body: blob
        });

        if (!response.ok) {
          throw new Error('Desktop project save failed: ' + response.status + ' ' + response.statusText);
        }

        chunks.length = 0;
      }
    };
  };

  if (streamUrl && sourcePath.toLowerCase().endsWith('.ssproj')) {
    window.showSaveFilePicker = async (options) => {
      if (!isSsprojSaveOptions(options)) {
        if (nativeShowSaveFilePicker) {
          return nativeShowSaveFilePicker(options);
        }
        throw new Error('Save dialog is unavailable');
      }

      assertDesktopProjectReadyToSave();

      return {
        name: desktopProjectName,
        async createWritable() {
          return createDesktopSsprojWritable();
        },
        async queryPermission() {
          return 'granted';
        },
        async requestPermission() {
          return 'granted';
        }
      };
    };
  }

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
  let stickySceneTransformFramesRemaining = sceneTransform ? 180 : 0;
  let userMovedCamera = false;
  let userMovedScene = false;
  let successfulCameraApplications = 0;
  let successfulSceneTransformApplications = 0;
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

  const stopStickySceneTransform = () => {
    if (successfulSceneTransformApplications < 1) {
      return;
    }
    userMovedScene = true;
    stickySceneTransformFramesRemaining = 0;
  };

  const refreshStickySceneTransform = (frames = 120) => {
    if (!sceneTransform || userMovedScene) {
      return;
    }
    stickySceneTransformFramesRemaining = Math.max(stickySceneTransformFramesRemaining, frames);
  };

  const getSceneSplat = () => {
    const scene = window.scene;
    const splatsByType = scene?.getElementsByType?.('splat') ?? [];
    const splat = splatsByType.find?.((element) => (
      element?.type === 'splat' &&
      element?.splatData &&
      element?.entity?.gsplat &&
      typeof element.move === 'function'
    )) ?? scene?.elements?.find?.((element) => (
      element?.type === 'splat' &&
      element?.splatData &&
      element?.entity?.gsplat &&
      typeof element.move === 'function'
    ));
    return splat && splat.entity ? splat : null;
  };

  const getSceneTransform = () => {
    const entity = getSceneSplat()?.entity;
    if (!entity) {
      return null;
    }

    const position = entity.getLocalPosition?.();
    const rotation = entity.getLocalEulerAngles?.() ?? entity.getLocalRotation?.()?.getEulerAngles?.();
    const scale = entity.getLocalScale?.();
    if (!position || !rotation || !scale) {
      return null;
    }

    return {
      positionX: position.x,
      positionY: position.y,
      positionZ: position.z,
      rotationX: rotation.x,
      rotationY: rotation.y,
      rotationZ: rotation.z,
      scale: scale.x
    };
  };

  const mergeSceneTransform = (nextState) => ({
    ...(getSceneTransform() ?? sceneTransform ?? {
      positionX: 0,
      positionY: 0,
      positionZ: 0,
      rotationX: 0,
      rotationY: 0,
      rotationZ: 180,
      scale: 1
    }),
    ...(nextState ?? {})
  });

  const mergeCameraPose = (nextPose) => ({
    ...(getCameraPose() ?? cameraPose ?? {
      fov: 75,
      positionX: 0,
      positionY: 0,
      positionZ: 0,
      targetX: 0,
      targetY: 0,
      targetZ: 1
    }),
    ...(nextPose ?? {})
  });

  const applyViewerOnlyRenderSettings = () => {
    if (desktopViewMode !== 'viewer') {
      return;
    }

    const events = window.scene?.events;
    if (!events?.fire) {
      return;
    }

    events.fire('grid.setVisible', false);
    events.fire('camera.setBound', false);
    events.fire('camera.setBoundDimensions', false);
    events.fire('camera.setOverlay', false);
    events.fire('camera.setControlMode', 'fly');
    if (window.scene?.camera) {
      window.scene.camera.controlMode = 'fly';
    }
  };

  const applySceneTransformNow = (transform) => {
    if (!transform) {
      return null;
    }

    const scene = window.scene;
    const splat = getSceneSplat();
    const entity = splat?.entity;
    if (!scene || !splat || !entity) {
      return null;
    }

    const currentPosition = entity.getLocalPosition?.();
    const currentRotation = entity.getLocalRotation?.();
    const currentScale = entity.getLocalScale?.();
    const Vec3Ctor = currentPosition?.constructor;
    const QuatCtor = currentRotation?.constructor;
    if (!Vec3Ctor || !QuatCtor) {
      return null;
    }

    const position = new Vec3Ctor(
      Number.isFinite(transform.positionX) ? transform.positionX : currentPosition.x,
      Number.isFinite(transform.positionY) ? transform.positionY : currentPosition.y,
      Number.isFinite(transform.positionZ) ? transform.positionZ : currentPosition.z
    );
    const rotation = new QuatCtor();
    rotation.setFromEulerAngles(
      Number.isFinite(transform.rotationX) ? transform.rotationX : 0,
      Number.isFinite(transform.rotationY) ? transform.rotationY : 0,
      Number.isFinite(transform.rotationZ) ? transform.rotationZ : 0
    );
    const scaleValue = Number.isFinite(transform.scale) ? transform.scale : currentScale?.x ?? 1;
    const scale = new Vec3Ctor(scaleValue, scaleValue, scaleValue);
    splat.move(position, rotation, scale);
    scene.boundDirty = true;
    scene.forceRender = true;
    successfulSceneTransformApplications += 1;
    return getSceneTransform() ?? transform;
  };

  const applySceneTransform = () => {
    if (!sceneTransform || userMovedScene || stickySceneTransformFramesRemaining <= 0) {
      return false;
    }

    if (!applySceneTransformNow(sceneTransform)) {
      return false;
    }

    stickySceneTransformFramesRemaining -= 1;
    return true;
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

  const setSceneTransform = (nextState) => {
    sceneTransform = mergeSceneTransform(nextState);
    userMovedScene = false;
    stickySceneTransformFramesRemaining = 0;
    return applySceneTransformNow(sceneTransform) ?? sceneTransform;
  };

  const setInitialCameraPose = (nextPose) => {
    cameraPose = mergeCameraPose(nextPose);
    userMovedCamera = false;
    stickyCameraFramesRemaining = Math.max(stickyCameraFramesRemaining, 60);
    applyCameraPose();
    return getCameraPose() ?? cameraPose;
  };

  const resetCamera = () => setInitialCameraPose(cameraPose ?? getCameraPose());

  const frameScene = () => {
    try {
      window.scene?.events?.fire?.('camera.focus');
    } catch {}
    return getCameraPose() ?? cameraPose;
  };

  window.__desktopGetSceneTransform = getSceneTransform;
  window.__desktopSetSceneTransform = setSceneTransform;
  window.__desktopSetInitialCameraPose = setInitialCameraPose;
  window.__desktopResetCamera = resetCamera;
  window.__desktopFrameScene = frameScene;
  window.__desktopGetSceneStats = () => ({ numSplats: getDesktopLoadedSplatCount() });

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
      refreshStickySceneTransform(120);
      applyCameraPose();
      applySceneTransform();
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
    applyViewerOnlyRenderSettings();
    tryApplyCameraPose();
    applySceneTransform();
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
  window.addEventListener('pointerdown', stopStickySceneTransform, { capture: true, passive: true });

  let rafAttempts = 0;
  const tick = () => {
    applyDesktopOverrides();
    injectViewerButton();
    rafAttempts += 1;
    if (
      (
        sourcePath ||
        (cameraPose && !userMovedCamera && stickyCameraFramesRemaining > 0) ||
        (sceneTransform && !userMovedScene && stickySceneTransformFramesRemaining > 0)
      ) &&
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
  const withDesktopBridge = retitled.replace(
    '<script type="module" src="./index.js"></script>',
    `${desktopBridgeScript}\n        <script type="module" src="./index.js?desktop=${packageJson.version}"></script>`
  );
  await writeFile(indexHtmlPath, withDesktopBridge, 'utf8');
};

const patchIndexJs = async () => {
  const indexJsPath = path.join(editorDir, 'index.js');
  const original = await readFile(indexJsPath, 'utf8');
  const ssprojArrayBufferImport =
    'if(o.endsWith(".ssproj"))await e.invoke("doc.load",t[s].contents??(await fetch(t[s].url)).arrayBuffer(),t[s].handle);';
  const ssprojFileImport =
    'if(o.endsWith(".ssproj")){let l=t[s].contents;if(!l){const n=await fetch(t[s].url),i=await n.arrayBuffer();l=new File([new Uint8Array(i)],t[s].filename||"scene.ssproj",{type:n.headers.get("content-type")||"application/x-supersplat"})}await e.invoke("doc.load",l,t[s].handle)}';
  const docLoadBlobSource =
    'r=async n=>{e.fire("startSpinner");const s=new QC(n),i=new Lb(s);try{a();';
  const docLoadNormalizedBlobSource =
    'r=async n=>{e.fire("startSpinner");n=typeof n?.size=="number"?n:new File([n instanceof ArrayBuffer?new Uint8Array(n):ArrayBuffer.isView(n)?new Uint8Array(n.buffer,n.byteOffset,n.byteLength):new Uint8Array(await n.arrayBuffer())],"scene.ssproj",{type:"application/x-supersplat"});const s=new QC(n),i=new Lb(s);try{a();';
  const savedSplatNamesSource = 'splats:s.map(t=>t.docSerialize())';
  const savedSplatNamesNormalized =
    'splats:s.map((t,e)=>({...t.docSerialize(),name:`splat_${e}.ply`}))';

  if (!original.includes(ssprojArrayBufferImport)) {
    throw new Error('Could not patch SuperSplat editor .ssproj import path. Upstream bundle changed.');
  }
  if (!original.includes(docLoadBlobSource)) {
    throw new Error('Could not patch SuperSplat editor doc.load input normalization. Upstream bundle changed.');
  }
  if (!original.includes(savedSplatNamesSource)) {
    throw new Error('Could not patch SuperSplat editor saved splat names. Upstream bundle changed.');
  }

  await writeFile(
    indexJsPath,
    original
      .replace(ssprojArrayBufferImport, ssprojFileImport)
      .replace(docLoadBlobSource, docLoadNormalizedBlobSource)
      .replace(savedSplatNamesSource, savedSplatNamesNormalized),
    'utf8'
  );
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
  await patchIndexJs();
  await trimEditorAssets();
};

await main();
