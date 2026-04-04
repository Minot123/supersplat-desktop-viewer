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
    const { contents, contentUrl, unified, aa, reorder, sceneTransform } = config;
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

  const entityAnchor = `            const entity = new Entity('gsplat');
            entity.setLocalEulerAngles(0, 0, 180);
            entity.addComponent('gsplat', {`;

  const entityPatched = `            const entity = new Entity('gsplat');
            const desktopScenePosition = sceneTransform?.position ?? [0, 0, 0];
            const desktopSceneRotation = sceneTransform?.rotation ?? [0, 0, 180];
            const desktopSceneScale = sceneTransform?.scale ?? 1;
            entity.setLocalPosition(
                desktopScenePosition[0] ?? 0,
                desktopScenePosition[1] ?? 0,
                desktopScenePosition[2] ?? 0
            );
            entity.setLocalEulerAngles(
                desktopSceneRotation[0] ?? 0,
                desktopSceneRotation[1] ?? 0,
                desktopSceneRotation[2] ?? 180
            );
            entity.setLocalScale(desktopSceneScale, desktopSceneScale, desktopSceneScale);
            entity.addComponent('gsplat', {`;

  const controllersAnchor = `        const controllers = {
            orbit: new OrbitController(),
            fly: new FlyController(),
            walk: new WalkController(),
            anim: animTrack ? new AnimController(animTrack) : null
        };
        controllers.orbit.fov = resetCamera.fov;`;

  const controllersPatched = `        const controllers = {
            orbit: new OrbitController(),
            fly: new FlyController(),
            walk: new WalkController(),
            anim: animTrack ? new AnimController(animTrack) : null
        };
        this.__desktopFrameCamera = new Camera().copy(frameCamera);
        this.__desktopResetCamera = new Camera().copy(resetCamera);
        this.__desktopControllers = controllers;
        controllers.orbit.controller.pitchRange = new Vec2(-180, 180);
        controllers.fly.controller.pitchRange = new Vec2(-180, 180);
        controllers.orbit.fov = resetCamera.fov;`;

  const cameraManagerAnchor = `            this.cameraManager = new CameraManager(global, sceneBound, collision);
            applyCamera(this.cameraManager.camera);`;

  const cameraManagerPatched = `            this.cameraManager = new CameraManager(global, sceneBound, collision);
            this.cameraManager.__desktopApplyCamera = applyCamera;
            this.cameraManager.__desktopGlobal = global;
            applyCamera(this.cameraManager.camera);`;

  const viewerLoadAnchor = `            const gsplat = results[0].gsplat;
            const collision = results[2];
            // get scene bounding box
            const gsplatBbox = gsplat.customAabb;`;

  const viewerLoadPatched = `            const gsplat = results[0].gsplat;
            const collision = results[2];
            // get scene bounding box
            const gsplatBbox = gsplat.customAabb;
            this.__desktopGsplatEntity = results[0];
            this.__desktopSceneBound = sceneBound;
            this.__desktopGsplatBounds = gsplatBbox ?? null;`;

  const frameResetAnchor = `                case 'frame':
                    state.cameraMode = 'orbit';
                    controllers.orbit.goto(frameCamera);
                    startTransition();
                    break;
                case 'reset':
                    state.cameraMode = 'orbit';
                    controllers.orbit.goto(resetCamera);
                    startTransition();
                    break;`;

  const frameResetPatched = `                case 'frame':
                    state.cameraMode = 'orbit';
                    controllers.orbit.goto(this.__desktopFrameCamera ?? frameCamera);
                    startTransition();
                    break;
                case 'reset':
                    state.cameraMode = 'orbit';
                    controllers.orbit.goto(this.__desktopResetCamera ?? resetCamera);
                    startTransition();
                    break;`;

  const cameraManagerPatchAnchor = `            this.cameraManager = new CameraManager(global, sceneBound, collision);
            this.cameraManager.__desktopApplyCamera = applyCamera;
            this.cameraManager.__desktopGlobal = global;
            applyCamera(this.cameraManager.camera);`;

  const cameraManagerPatchApplied = `            this.cameraManager = new CameraManager(global, sceneBound, collision);
            this.cameraManager.__desktopApplyCamera = applyCamera;
            this.cameraManager.__desktopGlobal = global;
            this.cameraManager.__desktopSceneBound = sceneBound;
            applyCamera(this.cameraManager.camera);`;

  const exportAnchor = `export { main };`;

  const desktopBridgeSnippet = `const desktopClamp = (value, min, max) => Math.max(min, Math.min(max, value));
const desktopWrapAngle = (value) => {
    const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
    return Object.is(wrapped, -0) ? 0 : wrapped;
};
const desktopFocus = new Vec3();
const desktopForward = new Vec3();
const desktopRotation = new Quat();
const desktopPosition = new Vec3();
const desktopTarget = new Vec3();
const desktopCreateCameraState = (camera, nextState = {}) => {
    const result = new Camera();
    result.copy(camera);
    const hasRotation = typeof nextState.x === 'number' || typeof nextState.y === 'number' || typeof nextState.z === 'number';
    if (typeof nextState.fov === 'number' && Number.isFinite(nextState.fov)) {
        result.fov = desktopClamp(nextState.fov, 20, 120);
    }
    if (hasRotation) {
        result.calcFocusPoint(desktopFocus);
        result.angles.set(
            typeof nextState.x === 'number' && Number.isFinite(nextState.x) ? desktopWrapAngle(nextState.x) : result.angles.x,
            typeof nextState.y === 'number' && Number.isFinite(nextState.y) ? desktopWrapAngle(nextState.y) : result.angles.y,
            typeof nextState.z === 'number' && Number.isFinite(nextState.z) ? desktopWrapAngle(nextState.z) : result.angles.z
        );
        desktopRotation.setFromEulerAngles(result.angles);
        desktopRotation.transformVector(Vec3.FORWARD, desktopForward);
        desktopForward.mulScalar(result.distance);
        result.position.copy(desktopFocus).sub(desktopForward);
    }
    return result;
};
const desktopSerializeCamera = (camera) => {
    return {
        fov: camera.fov,
        x: desktopWrapAngle(camera.angles.x),
        y: desktopWrapAngle(camera.angles.y),
        z: desktopWrapAngle(camera.angles.z)
    };
};
const desktopSerializeCameraPose = (camera) => {
    camera.calcFocusPoint(desktopFocus);
    return {
        fov: desktopClamp(camera.fov, 20, 120),
        positionX: camera.position.x,
        positionY: camera.position.y,
        positionZ: camera.position.z,
        targetX: desktopFocus.x,
        targetY: desktopFocus.y,
        targetZ: desktopFocus.z
    };
};
const desktopCreateCameraPoseState = (sourceCamera, nextPose = {}) => {
    const fallback = sourceCamera ?? new Camera();
    fallback.calcFocusPoint(desktopFocus);
    desktopPosition.set(
        typeof nextPose.positionX === 'number' && Number.isFinite(nextPose.positionX) ? nextPose.positionX : fallback.position.x,
        typeof nextPose.positionY === 'number' && Number.isFinite(nextPose.positionY) ? nextPose.positionY : fallback.position.y,
        typeof nextPose.positionZ === 'number' && Number.isFinite(nextPose.positionZ) ? nextPose.positionZ : fallback.position.z
    );
    desktopTarget.set(
        typeof nextPose.targetX === 'number' && Number.isFinite(nextPose.targetX) ? nextPose.targetX : desktopFocus.x,
        typeof nextPose.targetY === 'number' && Number.isFinite(nextPose.targetY) ? nextPose.targetY : desktopFocus.y,
        typeof nextPose.targetZ === 'number' && Number.isFinite(nextPose.targetZ) ? nextPose.targetZ : desktopFocus.z
    );
    return createCamera(
        desktopPosition.clone(),
        desktopTarget.clone(),
        typeof nextPose.fov === 'number' && Number.isFinite(nextPose.fov) ? desktopClamp(nextPose.fov, 20, 120) : fallback.fov
    );
};
const desktopSerializeSceneTransform = (entity) => {
    const position = entity.getLocalPosition();
    const rotation = entity.getLocalEulerAngles();
    const scale = entity.getLocalScale();
    return {
        positionX: position.x,
        positionY: position.y,
        positionZ: position.z,
        rotationX: desktopWrapAngle(rotation.x),
        rotationY: desktopWrapAngle(rotation.y),
        rotationZ: desktopWrapAngle(rotation.z),
        scale: scale.x
    };
};
const desktopApplySceneTransform = (entity, nextState = {}) => {
    const position = entity.getLocalPosition();
    const rotation = entity.getLocalEulerAngles();
    const scale = entity.getLocalScale();
    entity.setLocalPosition(
        typeof nextState.positionX === 'number' && Number.isFinite(nextState.positionX) ? nextState.positionX : position.x,
        typeof nextState.positionY === 'number' && Number.isFinite(nextState.positionY) ? nextState.positionY : position.y,
        typeof nextState.positionZ === 'number' && Number.isFinite(nextState.positionZ) ? nextState.positionZ : position.z
    );
    entity.setLocalEulerAngles(
        typeof nextState.rotationX === 'number' && Number.isFinite(nextState.rotationX) ? desktopWrapAngle(nextState.rotationX) : rotation.x,
        typeof nextState.rotationY === 'number' && Number.isFinite(nextState.rotationY) ? desktopWrapAngle(nextState.rotationY) : rotation.y,
        typeof nextState.rotationZ === 'number' && Number.isFinite(nextState.rotationZ) ? desktopWrapAngle(nextState.rotationZ) : rotation.z
    );
    const uniformScale = typeof nextState.scale === 'number' && Number.isFinite(nextState.scale)
        ? desktopClamp(nextState.scale, 0.001, 10000)
        : scale.x;
    entity.setLocalScale(uniformScale, uniformScale, uniformScale);
    return desktopSerializeSceneTransform(entity);
};
CameraManager.prototype.getDesktopCameraState = function() {
    return desktopSerializeCamera(this.camera);
};
CameraManager.prototype.setDesktopCameraState = function(nextState = {}) {
    const controllers = this.__desktopControllers;
    const applyCamera = this.__desktopApplyCamera;
    const global = this.__desktopGlobal;
    if (!controllers || !applyCamera || !global) {
        return desktopSerializeCamera(this.camera);
    }
    const nextCamera = desktopCreateCameraState(this.camera, nextState);
    controllers.orbit.fov = nextCamera.fov;
    controllers.fly.fov = nextCamera.fov;
    controllers.orbit.goto(nextCamera);
    if (global.state.cameraMode !== 'orbit') {
        global.state.cameraMode = 'orbit';
    }
    this.camera.copy(nextCamera);
    applyCamera(nextCamera);
    global.app.renderNextFrame = true;
    return desktopSerializeCamera(this.camera);
};
CameraManager.prototype.resetDesktopCamera = function() {
    const global = this.__desktopGlobal;
    if (!global) {
        return desktopSerializeCamera(this.camera);
    }
    global.events.fire('inputEvent', 'reset');
    global.app.renderNextFrame = true;
    return desktopSerializeCamera(this.camera);
};
CameraManager.prototype.frameDesktopScene = function() {
    const global = this.__desktopGlobal;
    if (!global) {
        return desktopSerializeCamera(this.camera);
    }
    global.events.fire('inputEvent', 'frame');
    global.app.renderNextFrame = true;
    return desktopSerializeCamera(this.camera);
};
CameraManager.prototype.getDesktopInitialCameraPose = function() {
    return desktopSerializeCameraPose(this.__desktopResetCamera ?? this.camera);
};
CameraManager.prototype.setDesktopInitialCameraPose = function(nextPose = {}) {
    const controllers = this.__desktopControllers;
    const applyCamera = this.__desktopApplyCamera;
    const global = this.__desktopGlobal;
    if (!controllers || !applyCamera || !global) {
        return this.getDesktopInitialCameraPose();
    }
    const sourceCamera = this.__desktopResetCamera ?? this.camera;
    const nextCamera = desktopCreateCameraPoseState(sourceCamera, nextPose);
    this.__desktopResetCamera = new Camera().copy(nextCamera);
    if (this.__desktopSceneBound) {
        this.__desktopFrameCamera = new Camera().copy(createFrameCamera(this.__desktopSceneBound, nextCamera.fov));
    }
    controllers.orbit.fov = nextCamera.fov;
    controllers.fly.fov = nextCamera.fov;
    if (global.state.cameraMode !== 'orbit') {
        global.state.cameraMode = 'orbit';
    }
    controllers.orbit.goto(nextCamera);
    this.camera.copy(nextCamera);
    applyCamera(nextCamera);
    global.app.renderNextFrame = true;
    return this.getDesktopInitialCameraPose();
};
Viewer.prototype.getDesktopCameraState = function() {
    return this.cameraManager?.getDesktopCameraState?.() ?? null;
};
Viewer.prototype.setDesktopCameraState = function(nextState = {}) {
    return this.cameraManager?.setDesktopCameraState?.(nextState) ?? null;
};
Viewer.prototype.resetDesktopCamera = function() {
    return this.cameraManager?.resetDesktopCamera?.() ?? null;
};
Viewer.prototype.frameDesktopScene = function() {
    return this.cameraManager?.frameDesktopScene?.() ?? null;
};
Viewer.prototype.getDesktopInitialCameraPose = function() {
    return this.cameraManager?.getDesktopInitialCameraPose?.() ?? null;
};
Viewer.prototype.getDesktopCurrentCameraPose = function() {
    return this.cameraManager?.camera ? desktopSerializeCameraPose(this.cameraManager.camera) : null;
};
Viewer.prototype.setDesktopInitialCameraPose = function(nextPose = {}) {
    return this.cameraManager?.setDesktopInitialCameraPose?.(nextPose) ?? null;
};
Viewer.prototype.getDesktopSceneTransform = function() {
    return this.__desktopGsplatEntity ? desktopSerializeSceneTransform(this.__desktopGsplatEntity) : null;
};
Viewer.prototype.setDesktopSceneTransform = function(nextState = {}) {
    if (!this.__desktopGsplatEntity) {
        return null;
    }
    const result = desktopApplySceneTransform(this.__desktopGsplatEntity, nextState);
    if (this.__desktopGsplatBounds && this.__desktopSceneBound) {
        this.__desktopSceneBound.setFromTransformedAabb(
            this.__desktopGsplatBounds,
            this.__desktopGsplatEntity.getWorldTransform()
        );
        if (this.cameraManager) {
            const fov = this.cameraManager.__desktopResetCamera?.fov ?? this.cameraManager.camera?.fov ?? 75;
            this.cameraManager.__desktopFrameCamera = new Camera().copy(createFrameCamera(this.__desktopSceneBound, fov));
            this.cameraManager.__desktopSceneBound = this.__desktopSceneBound;
        }
    }
    this.global?.app && (this.global.app.renderNextFrame = true);
    return result;
};
Viewer.prototype.getDesktopSceneStats = function() {
    const gsplatComponent = this.__desktopGsplatEntity?.gsplat;
    const numSplats = [
        gsplatComponent?.instance?.splat?.numSplats,
        gsplatComponent?.instance?.gsplat?.numSplats,
        gsplatComponent?.resource?.numSplats,
        gsplatComponent?.asset?.resource?.numSplats,
        gsplatComponent?.asset?.resource?.gsplatData?.numSplats
    ].find((value)=>typeof value === 'number' && Number.isFinite(value) && value > 0) ?? null;
    return {
        numSplats
    };
};
Viewer.prototype.applyDesktopDefaults = function() {
    if (!this.global) {
        return this.getDesktopCameraState();
    }
    this.global.state.animationPaused = true;
    this.global.state.hasAnimation = false;
    if (this.global.state.cameraMode === 'anim') {
        this.global.state.cameraMode = 'orbit';
    }
    this.global.events.fire('inputEvent', 'reset');
    this.global.app.renderNextFrame = true;
    return this.getDesktopCameraState();
};`;

  let patchedSource = scriptSource.replace(originalSnippet, patchedSnippet);

  if (!patchedSource.includes(entityAnchor)) {
    throw new Error('Unable to patch upstream viewer index.js: scene transform anchor not found');
  }

  patchedSource = patchedSource.replace(entityAnchor, entityPatched);

  if (!patchedSource.includes(controllersAnchor)) {
    throw new Error('Unable to patch upstream viewer index.js: desktop controllers anchor not found');
  }

  patchedSource = patchedSource.replace(controllersAnchor, controllersPatched);

  if (!patchedSource.includes(cameraManagerAnchor)) {
    throw new Error('Unable to patch upstream viewer index.js: camera manager anchor not found');
  }

  patchedSource = patchedSource.replace(cameraManagerAnchor, cameraManagerPatched);

  if (!patchedSource.includes(viewerLoadAnchor)) {
    throw new Error('Unable to patch upstream viewer index.js: viewer scene anchor not found');
  }

  patchedSource = patchedSource.replace(viewerLoadAnchor, viewerLoadPatched);

  if (!patchedSource.includes(frameResetAnchor)) {
    throw new Error('Unable to patch upstream viewer index.js: frame/reset anchor not found');
  }

  patchedSource = patchedSource.replace(frameResetAnchor, frameResetPatched);

  if (!patchedSource.includes(cameraManagerPatchAnchor)) {
    throw new Error('Unable to patch upstream viewer index.js: camera manager desktop anchor not found');
  }

  patchedSource = patchedSource.replace(cameraManagerPatchAnchor, cameraManagerPatchApplied);

  if (!patchedSource.includes(exportAnchor)) {
    throw new Error('Unable to patch upstream viewer index.js: export anchor not found');
  }

  return patchedSource.replace(exportAnchor, `${desktopBridgeSnippet}\n\n${exportAnchor}`);
};

const defaultSettings = {
  annotations: [],
  animTracks: [],
  background: {
    color: [0, 0, 0]
  },
  cameras: [],
  desktop: {
    sceneTransform: {
      position: [0, 0, 0],
      rotation: [0, 0, 180],
      scale: 1
    }
  },
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
