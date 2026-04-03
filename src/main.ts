import './styles.css';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import type { OpenFilePayload } from './shared/files';

type UiState = 'idle' | 'loading' | 'ready' | 'error';

type ViewerConfig = {
  contentUrl: string;
  contents: Promise<Response>;
  noanim: boolean;
  reorder?: boolean;
  sceneTransform?: {
    position: [number, number, number];
    rotation: [number, number, number];
    scale: number;
  };
};

type DesktopCameraState = {
  fov: number;
  x: number;
  y: number;
  z: number;
};

type DesktopSceneTransformState = {
  positionX: number;
  positionY: number;
  positionZ: number;
  rotationX: number;
  rotationY: number;
  rotationZ: number;
  scale: number;
};

type DesktopInitialCameraPose = {
  fov: number;
  positionX: number;
  positionY: number;
  positionZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
};

type ViewerSceneStats = {
  numSplats: number | null;
};

type ViewerApp = {
  destroy?: () => void;
  renderNextFrame?: boolean;
};

type ViewerGlobalEvents = {
  fire?: (eventName: string, ...args: unknown[]) => void;
};

type ViewerGlobalState = {
  animationPaused?: boolean;
  cameraMode?: string;
  hasAnimation?: boolean;
};

type ViewerGlobal = {
  app?: ViewerApp;
  events?: ViewerGlobalEvents | null;
  state?: ViewerGlobalState | null;
};

type ViewerCameraManager = {
  frameDesktopScene?: () => DesktopCameraState | null;
  getDesktopCameraState?: () => DesktopCameraState | null;
  getDesktopInitialCameraPose?: () => DesktopInitialCameraPose | null;
  resetDesktopCamera?: () => DesktopCameraState | null;
  setDesktopInitialCameraPose?: (nextPose: Partial<DesktopInitialCameraPose>) => DesktopInitialCameraPose | null;
  setDesktopCameraState?: (nextState: Partial<DesktopCameraState>) => DesktopCameraState | null;
};

type ViewerInstance = {
  annotations?: { parentDom?: HTMLElement | null } | null;
  cameraFrame?: { destroy?: () => void } | null;
  cameraManager?: ViewerCameraManager | null;
  global?: ViewerGlobal | null;
  inputController?: { destroy?: () => void } | null;
  applyDesktopDefaults?: () => DesktopCameraState | null;
  frameDesktopScene?: () => DesktopCameraState | null;
  getDesktopCameraState?: () => DesktopCameraState | null;
  getDesktopInitialCameraPose?: () => DesktopInitialCameraPose | null;
  getDesktopSceneTransform?: () => DesktopSceneTransformState | null;
  getDesktopSceneStats?: () => ViewerSceneStats | null;
  resetDesktopCamera?: () => DesktopCameraState | null;
  setDesktopInitialCameraPose?: (nextPose: Partial<DesktopInitialCameraPose>) => DesktopInitialCameraPose | null;
  setDesktopCameraState?: (nextState: Partial<DesktopCameraState>) => DesktopCameraState | null;
  setDesktopSceneTransform?: (nextState: Partial<DesktopSceneTransformState>) => DesktopSceneTransformState | null;
  voxelOverlay?: { destroy?: () => void } | null;
  walkCursor?: { destroy?: () => void } | null;
};

type ViewerMain = (
  canvas: HTMLCanvasElement,
  settingsJson: unknown,
  config: ViewerConfig
) => Promise<ViewerInstance>;

type MountedViewer = {
  cleanup: () => void;
  root: HTMLDivElement;
  viewer: ViewerInstance | null;
};

type PreparedContent = {
  contentUrl: string;
  contents: Promise<Response>;
  dispose: () => Promise<void>;
};

type LocalHttpStreamOpenPayload = {
  sessionId: number;
  streamUrl: string;
  sizeBytes: number;
};

declare global {
  interface Window {
    animationDuration?: number;
    firstFrame?: () => void;
    scrubTo?: (time: number) => Promise<void>;
  }
}

const FILE_OPEN_EVENT = 'file-open';
const STORAGE_KEYS = {
  initialCameraPose: 'supersplat.desktop.initialCameraPose.v1'
} as const;

const state = {
  currentFile: null as OpenFilePayload | null,
  currentRequestId: '',
  inspectorOpen: true,
  lastLoadMs: null as number | null,
  loadingCaption: 'Select a local scene to preview',
  loadingPercent: null as number | null,
  message: '',
  messageKind: 'error' as 'error' | 'warning',
  sceneNumSplats: null as number | null,
  uiState: 'idle' as UiState
};

const sessionViewerPreferences = {
  fov: 75,
  initialized: false,
  rotation: {
    rotationX: 0,
    rotationY: 0,
    rotationZ: 180
  }
};

const viewerRuntime = {
  bodyMarkup: null as string | null,
  bodyTemplate: null as HTMLTemplateElement | null,
  activeViewer: null as MountedViewer | null,
  mainFn: null as ViewerMain | null,
  nextSessionId: 1,
  settingsJson: null as unknown
};

let messageTimer: number | null = null;
let syncingInspectorControls = false;

const elements = {
  cameraPanel: document.getElementById('cameraPanel') as HTMLDivElement,
  cameraFovNumber: document.getElementById('cameraFovNumber') as HTMLInputElement,
  cameraFovRange: document.getElementById('cameraFovRange') as HTMLInputElement,
  cameraPositionXNumber: document.getElementById('cameraPositionXNumber') as HTMLInputElement,
  cameraPositionYNumber: document.getElementById('cameraPositionYNumber') as HTMLInputElement,
  cameraPositionZNumber: document.getElementById('cameraPositionZNumber') as HTMLInputElement,
  cameraTargetXNumber: document.getElementById('cameraTargetXNumber') as HTMLInputElement,
  cameraTargetYNumber: document.getElementById('cameraTargetYNumber') as HTMLInputElement,
  cameraTargetZNumber: document.getElementById('cameraTargetZNumber') as HTMLInputElement,
  emptyOpenButton: document.getElementById('emptyOpenButton') as HTMLButtonElement,
  emptyStateCopy: document.getElementById('emptyStateCopy') as HTMLParagraphElement,
  emptyStateKicker: document.getElementById('emptyStateKicker') as HTMLDivElement,
  emptyStateTitle: document.getElementById('emptyStateTitle') as HTMLHeadingElement,
  emptyState: document.getElementById('emptyState') as HTMLDivElement,
  fieldOfViewTitle: document.getElementById('fieldOfViewTitle') as HTMLDivElement,
  filePath: document.getElementById('filePath') as HTMLSpanElement,
  fileName: document.getElementById('fileName') as HTMLSpanElement,
  frameSceneButton: document.getElementById('frameSceneButton') as HTMLButtonElement,
  loadingEyebrow: document.getElementById('loadingEyebrow') as HTMLDivElement,
  loadingCaption: document.getElementById('loadingCaption') as HTMLSpanElement,
  loadingFill: document.getElementById('loadingFill') as HTMLDivElement,
  loadingOverlay: document.getElementById('loadingOverlay') as HTMLDivElement,
  loadingPercent: document.getElementById('loadingPercent') as HTMLSpanElement,
  loadingTitle: document.getElementById('loadingTitle') as HTMLDivElement,
  messageBanner: document.getElementById('messageBanner') as HTMLDivElement,
  modelRotationXNumber: document.getElementById('modelRotationXNumber') as HTMLInputElement,
  modelRotationXRange: document.getElementById('modelRotationXRange') as HTMLInputElement,
  modelRotationYNumber: document.getElementById('modelRotationYNumber') as HTMLInputElement,
  modelRotationYRange: document.getElementById('modelRotationYRange') as HTMLInputElement,
  modelRotationZNumber: document.getElementById('modelRotationZNumber') as HTMLInputElement,
  modelRotationZRange: document.getElementById('modelRotationZRange') as HTMLInputElement,
  openFileButton: document.getElementById('openFileButton') as HTMLButtonElement,
  cameraPanelEyebrow: document.getElementById('cameraPanelEyebrow') as HTMLDivElement,
  cameraPositionLabel: document.getElementById('cameraPositionLabel') as HTMLSpanElement,
  cameraTargetLabel: document.getElementById('cameraTargetLabel') as HTMLSpanElement,
  resetViewButton: document.getElementById('resetViewButton') as HTMLButtonElement,
  rotationTitle: document.getElementById('rotationTitle') as HTMLDivElement,
  sceneStats: document.getElementById('sceneStats') as HTMLDivElement,
  startCameraTitle: document.getElementById('startCameraTitle') as HTMLDivElement,
  statusBadge: document.getElementById('statusBadge') as HTMLDivElement,
  togglePanelButton: document.getElementById('togglePanelButton') as HTMLButtonElement,
  menuTriggerLabel: document.getElementById('menuTriggerLabel') as HTMLSpanElement,
  viewerStateText: document.getElementById('viewerStateText') as HTMLDivElement,
  viewerViewport: document.getElementById('viewerViewport') as HTMLDivElement
};

const DEFAULT_SCENE_TRANSFORM: DesktopSceneTransformState = {
  positionX: 0,
  positionY: 0,
  positionZ: 0,
  rotationX: 0,
  rotationY: 0,
  rotationZ: 180,
  scale: 1
};

const DEFAULT_INITIAL_CAMERA_POSE: DesktopInitialCameraPose = {
  fov: 75,
  positionX: 0,
  positionY: 0,
  positionZ: 0,
  targetX: 0,
  targetY: 0,
  targetZ: 1
};

const SCENE_LIMITS: Record<keyof DesktopSceneTransformState, { max: number; min: number }> = {
  positionX: { max: 100000, min: -100000 },
  positionY: { max: 100000, min: -100000 },
  positionZ: { max: 100000, min: -100000 },
  rotationX: { max: 180, min: -180 },
  rotationY: { max: 180, min: -180 },
  rotationZ: { max: 180, min: -180 },
  scale: { max: 10000, min: 0.001 }
};

const CAMERA_LIMITS: Record<keyof DesktopInitialCameraPose, { max: number; min: number }> = {
  fov: { max: 120, min: 20 },
  positionX: { max: 100000, min: -100000 },
  positionY: { max: 100000, min: -100000 },
  positionZ: { max: 100000, min: -100000 },
  targetX: { max: 100000, min: -100000 },
  targetY: { max: 100000, min: -100000 },
  targetZ: { max: 100000, min: -100000 }
};

const modelRotationInputMap: Record<
  'rotationX' | 'rotationY' | 'rotationZ',
  { number: HTMLInputElement; range: HTMLInputElement }
> = {
  rotationX: { number: elements.modelRotationXNumber, range: elements.modelRotationXRange },
  rotationY: { number: elements.modelRotationYNumber, range: elements.modelRotationYRange },
  rotationZ: { number: elements.modelRotationZNumber, range: elements.modelRotationZRange }
};

const initialCameraNumericInputs: Record<
  'positionX' | 'positionY' | 'positionZ' | 'targetX' | 'targetY' | 'targetZ',
  HTMLInputElement
> = {
  positionX: elements.cameraPositionXNumber,
  positionY: elements.cameraPositionYNumber,
  positionZ: elements.cameraPositionZNumber,
  targetX: elements.cameraTargetXNumber,
  targetY: elements.cameraTargetYNumber,
  targetZ: elements.cameraTargetZNumber
};

const TEXT = {
  cameraPanelEyebrow: 'SCENE SETTINGS',
  cameraPositionLabel: 'Position',
  cameraTargetLabel: 'Target',
  chooseScene: 'Choose Scene',
  emptyStateCopy: 'Open a local file from the system dialog or drag a scene directly into the app window.',
  emptyStateKicker: 'Offline Windows Viewer',
  emptyStateTitle: 'Local viewer for 3D Gaussian Splat scenes',
  error: 'Loading error',
  errorLoading: 'Loading error',
  fieldOfViewTitle: 'Field of View',
  frame: 'Frame',
  idle: 'Waiting for file',
  loading: 'Loading scene',
  loadingEyebrow: 'Scene Loading',
  menu: 'Menu',
  openFile: 'Open File',
  openLocalScene: 'Open a local scene',
  openScene: 'Opening scene',
  preparingFirstFrame: 'Preparing first frame',
  preparingNewScene: 'Preparing new scene',
  preparingScene: 'Preparing scene',
  ready: 'Scene ready',
  readyIn: 'Scene ready in {duration}',
  reset: 'Reset',
  rotationTitle: 'Rotation',
  sceneOpenError: 'Viewer failed to open the scene.',
  selectLocalScene: 'Select a local scene to preview',
  startCameraTitle: 'Start Camera',
  streamOpenFailed: 'Failed to open streamed local file.',
  streamingData: 'Loading scene data',
  unsupportedFiles: 'Only local .ply, .sog, .meta.json and .lod-meta.json files are supported.',
  viewerError: 'Viewer reported an error while opening the local scene',
  viewerInit: 'Initializing PlayCanvas viewer',
  waitCurrentLoad: 'Wait for the current scene to finish loading.',
  loadingPercent: 'Loading {percent}%'
} as const;

type TranslationKey = keyof typeof TEXT;

const getLocale = () => 'en-US';
const t = (key: TranslationKey): string => TEXT[key];
const translateTemplate = (
  key: TranslationKey,
  replacements: Record<string, string | number>
) => {
  let result = t(key);
  for (const [name, value] of Object.entries(replacements)) {
    result = result.replace(`{${name}}`, String(value));
  }
  return result;
};

const applyStaticText = () => {
  document.documentElement.lang = 'en';
  elements.menuTriggerLabel.textContent = t('menu');
  elements.emptyStateKicker.textContent = t('emptyStateKicker');
  elements.emptyStateTitle.textContent = t('emptyStateTitle');
  elements.emptyStateCopy.textContent = t('emptyStateCopy');
  elements.emptyOpenButton.textContent = t('chooseScene');
  elements.loadingEyebrow.textContent = t('loadingEyebrow');
  elements.cameraPanelEyebrow.textContent = t('cameraPanelEyebrow');
  elements.fieldOfViewTitle.textContent = t('fieldOfViewTitle');
  elements.rotationTitle.textContent = t('rotationTitle');
  elements.startCameraTitle.textContent = t('startCameraTitle');
  elements.cameraPositionLabel.textContent = t('cameraPositionLabel');
  elements.cameraTargetLabel.textContent = t('cameraTargetLabel');
  elements.openFileButton.textContent = t('openFile');
  elements.frameSceneButton.textContent = t('frame');
  elements.resetViewButton.textContent = t('reset');
};

const getLaunchFile = () => invoke<OpenFilePayload | null>('get_launch_file');
const openLocalHttpStream = (filePath: string) =>
  invoke<LocalHttpStreamOpenPayload | null>('open_local_http_stream', { filePath });
const resolveFilePath = (filePath: string) =>
  invoke<OpenFilePayload | null>('resolve_file_path', { filePath });
const closeLocalHttpStream = (sessionId: number) =>
  invoke<boolean>('close_local_http_stream', { sessionId });
const reportRendererError = (message: string) => invoke('report_renderer_error', { message });

const formatDuration = (durationMs: number) => {
  if (durationMs < 1000) {
    return `${Math.round(durationMs)} ms`;
  }

  return `${(durationMs / 1000).toFixed(2)} s`;
};

const formatBytes = (sizeBytes: number) => {
  if (!Number.isFinite(sizeBytes) || sizeBytes <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(units.length - 1, Math.floor(Math.log(sizeBytes) / Math.log(1024)));
  const value = sizeBytes / 1024 ** unitIndex;
  const digits = value >= 100 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
};

const formatExactCount = (value: number) =>
  new Intl.NumberFormat(getLocale(), {
    maximumFractionDigits: 0
  }).format(Math.round(value));

const getSceneStatsText = () => {
  if (!state.currentFile) {
    return t('openLocalScene');
  }

  const segments: string[] = [];
  if (typeof state.sceneNumSplats === 'number' && Number.isFinite(state.sceneNumSplats) && state.sceneNumSplats > 0) {
    segments.push(`${formatExactCount(state.sceneNumSplats)} splats`);
  }
  segments.push(formatBytes(state.currentFile.sizeBytes));
  return segments.join(' · ');
};

const getViewerStateText = () => {
  switch (state.uiState) {
    case 'error':
      return t('viewerError');
    case 'loading':
      return state.loadingPercent !== null
        ? translateTemplate('loadingPercent', { percent: state.loadingPercent })
        : state.loadingCaption;
    case 'ready':
      return state.lastLoadMs
        ? translateTemplate('readyIn', { duration: formatDuration(state.lastLoadMs) })
        : t('ready');
    case 'idle':
    default:
      return t('selectLocalScene');
  }
};

const clearMessage = () => {
  if (messageTimer) {
    window.clearTimeout(messageTimer);
    messageTimer = null;
  }

  state.message = '';
  render();
};

const scheduleMessageClear = () => {
  if (messageTimer) {
    window.clearTimeout(messageTimer);
  }

  messageTimer = window.setTimeout(() => {
    clearMessage();
  }, 4200);
};

const setFatalError = async (message: string) => {
  if (messageTimer) {
    window.clearTimeout(messageTimer);
    messageTimer = null;
  }

  state.message = message;
  state.messageKind = 'error';
  state.uiState = 'error';
  render();
  await reportRendererError(message);
};

const showWarning = (message: string) => {
  state.message = message;
  state.messageKind = 'warning';
  render();
  scheduleMessageClear();
};

const clearIssueState = () => {
  if (messageTimer) {
    window.clearTimeout(messageTimer);
    messageTimer = null;
  }

  state.lastLoadMs = null;
  state.loadingCaption = t('preparingScene');
  state.loadingPercent = null;
  state.message = '';
  state.sceneNumSplats = null;
  if (state.uiState === 'error') {
    state.uiState = state.currentFile ? 'loading' : 'idle';
  }
};

const nextRequestId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const extractErrorMessage = (value: unknown, fallback: string) => {
  if (value instanceof Error && value.message.trim()) {
    return value.message.trim();
  }

  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof (value as { message?: unknown }).message === 'string'
  ) {
    const message = (value as { message: string }).message.trim();
    if (message) {
      return message;
    }
  }

  return fallback;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const wrapAngle = (value: number) => {
  const wrapped = ((value + 180) % 360 + 360) % 360 - 180;
  return Object.is(wrapped, -0) ? 0 : wrapped;
};

const getActiveViewer = () => viewerRuntime.activeViewer?.viewer ?? null;

type RuntimeSettingsJson = {
  cameras?: Array<{
    initial?: {
      fov?: number;
      position?: [number, number, number];
      target?: [number, number, number];
    };
  }>;
  desktop?: {
    sceneTransform?: {
      position?: [number, number, number];
      rotation?: [number, number, number];
      scale?: number;
    };
  };
};

const cloneSettingsJson = <T>(value: T): T => {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }

  return JSON.parse(JSON.stringify(value)) as T;
};

const readStoredJson = <T>(key: string): T | null => {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      return null;
    }

    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

const writeStoredJson = (key: string, value: unknown) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {}
};

const getConfiguredSceneTransform = () => {
  const desktopSettings = (viewerRuntime.settingsJson as RuntimeSettingsJson | null)?.desktop?.sceneTransform;

  return {
    position: [
      desktopSettings?.position?.[0] ?? DEFAULT_SCENE_TRANSFORM.positionX,
      desktopSettings?.position?.[1] ?? DEFAULT_SCENE_TRANSFORM.positionY,
      desktopSettings?.position?.[2] ?? DEFAULT_SCENE_TRANSFORM.positionZ
    ] as [number, number, number],
    rotation: [
      desktopSettings?.rotation?.[0] ?? DEFAULT_SCENE_TRANSFORM.rotationX,
      desktopSettings?.rotation?.[1] ?? DEFAULT_SCENE_TRANSFORM.rotationY,
      desktopSettings?.rotation?.[2] ?? DEFAULT_SCENE_TRANSFORM.rotationZ
    ] as [number, number, number],
    scale: desktopSettings?.scale ?? DEFAULT_SCENE_TRANSFORM.scale
  };
};

const normalizeSceneTransformState = (
  sceneState: Partial<DesktopSceneTransformState> | null | undefined
): DesktopSceneTransformState => ({
  positionX: clamp(
    sceneState?.positionX ?? DEFAULT_SCENE_TRANSFORM.positionX,
    SCENE_LIMITS.positionX.min,
    SCENE_LIMITS.positionX.max
  ),
  positionY: clamp(
    sceneState?.positionY ?? DEFAULT_SCENE_TRANSFORM.positionY,
    SCENE_LIMITS.positionY.min,
    SCENE_LIMITS.positionY.max
  ),
  positionZ: clamp(
    sceneState?.positionZ ?? DEFAULT_SCENE_TRANSFORM.positionZ,
    SCENE_LIMITS.positionZ.min,
    SCENE_LIMITS.positionZ.max
  ),
  rotationX: wrapAngle(
    clamp(
      sceneState?.rotationX ?? DEFAULT_SCENE_TRANSFORM.rotationX,
      SCENE_LIMITS.rotationX.min,
      SCENE_LIMITS.rotationX.max
    )
  ),
  rotationY: wrapAngle(
    clamp(
      sceneState?.rotationY ?? DEFAULT_SCENE_TRANSFORM.rotationY,
      SCENE_LIMITS.rotationY.min,
      SCENE_LIMITS.rotationY.max
    )
  ),
  rotationZ: wrapAngle(
    clamp(
      sceneState?.rotationZ ?? DEFAULT_SCENE_TRANSFORM.rotationZ,
      SCENE_LIMITS.rotationZ.min,
      SCENE_LIMITS.rotationZ.max
    )
  ),
  scale: clamp(sceneState?.scale ?? DEFAULT_SCENE_TRANSFORM.scale, SCENE_LIMITS.scale.min, SCENE_LIMITS.scale.max)
});

const normalizeInitialCameraPose = (
  pose: Partial<DesktopInitialCameraPose> | null | undefined
): DesktopInitialCameraPose => ({
  fov: clamp(pose?.fov ?? DEFAULT_INITIAL_CAMERA_POSE.fov, CAMERA_LIMITS.fov.min, CAMERA_LIMITS.fov.max),
  positionX: clamp(
    pose?.positionX ?? DEFAULT_INITIAL_CAMERA_POSE.positionX,
    CAMERA_LIMITS.positionX.min,
    CAMERA_LIMITS.positionX.max
  ),
  positionY: clamp(
    pose?.positionY ?? DEFAULT_INITIAL_CAMERA_POSE.positionY,
    CAMERA_LIMITS.positionY.min,
    CAMERA_LIMITS.positionY.max
  ),
  positionZ: clamp(
    pose?.positionZ ?? DEFAULT_INITIAL_CAMERA_POSE.positionZ,
    CAMERA_LIMITS.positionZ.min,
    CAMERA_LIMITS.positionZ.max
  ),
  targetX: clamp(
    pose?.targetX ?? DEFAULT_INITIAL_CAMERA_POSE.targetX,
    CAMERA_LIMITS.targetX.min,
    CAMERA_LIMITS.targetX.max
  ),
  targetY: clamp(
    pose?.targetY ?? DEFAULT_INITIAL_CAMERA_POSE.targetY,
    CAMERA_LIMITS.targetY.min,
    CAMERA_LIMITS.targetY.max
  ),
  targetZ: clamp(
    pose?.targetZ ?? DEFAULT_INITIAL_CAMERA_POSE.targetZ,
    CAMERA_LIMITS.targetZ.min,
    CAMERA_LIMITS.targetZ.max
  )
});

const getPersistedInitialCameraPose = () =>
  normalizeInitialCameraPose(readStoredJson<Partial<DesktopInitialCameraPose>>(STORAGE_KEYS.initialCameraPose));

const hydrateSessionViewerPreferences = () => {
  if (sessionViewerPreferences.initialized) {
    return;
  }

  const configuredSceneTransform = getConfiguredSceneTransform();
  const persistedInitialCameraPose = getPersistedInitialCameraPose();
  sessionViewerPreferences.rotation = {
    rotationX: configuredSceneTransform.rotation[0] ?? DEFAULT_SCENE_TRANSFORM.rotationX,
    rotationY: configuredSceneTransform.rotation[1] ?? DEFAULT_SCENE_TRANSFORM.rotationY,
    rotationZ: configuredSceneTransform.rotation[2] ?? DEFAULT_SCENE_TRANSFORM.rotationZ
  };
  sessionViewerPreferences.fov = persistedInitialCameraPose.fov;
  sessionViewerPreferences.initialized = true;
};

const getSessionSceneTransform = () => {
  hydrateSessionViewerPreferences();
  const configuredSceneTransform = getConfiguredSceneTransform();
  return {
    position: configuredSceneTransform.position,
    rotation: [
      sessionViewerPreferences.rotation.rotationX,
      sessionViewerPreferences.rotation.rotationY,
      sessionViewerPreferences.rotation.rotationZ
    ] as [number, number, number],
    scale: configuredSceneTransform.scale
  };
};

const applySessionFovToSettings = (settings: RuntimeSettingsJson) => {
  hydrateSessionViewerPreferences();

  if (!Array.isArray(settings.cameras)) {
    settings.cameras = [];
  }

  settings.cameras[0] = {
    ...(settings.cameras[0] ?? {}),
    initial: {
      ...(settings.cameras[0]?.initial ?? {}),
      fov: sessionViewerPreferences.fov
    }
  };
};

const rememberSessionRotation = (sceneState: Partial<DesktopSceneTransformState> | null | undefined) => {
  if (!sceneState) {
    return;
  }

  hydrateSessionViewerPreferences();
  const normalizedState = normalizeSceneTransformState(sceneState);
  sessionViewerPreferences.rotation = {
    rotationX: normalizedState.rotationX,
    rotationY: normalizedState.rotationY,
    rotationZ: normalizedState.rotationZ
  };
};

const rememberSessionFov = (fov: number | null | undefined) => {
  if (typeof fov !== 'number' || !Number.isFinite(fov)) {
    return;
  }

  hydrateSessionViewerPreferences();
  sessionViewerPreferences.fov = clamp(fov, CAMERA_LIMITS.fov.min, CAMERA_LIMITS.fov.max);
};

const persistInitialCameraPose = (pose: Partial<DesktopInitialCameraPose> | null | undefined) => {
  const normalizedPose = normalizeInitialCameraPose(pose);
  writeStoredJson(STORAGE_KEYS.initialCameraPose, normalizedPose);

  const settings = viewerRuntime.settingsJson as RuntimeSettingsJson | null;
  if (settings) {
    const initial = {
      fov: normalizedPose.fov,
      position: [normalizedPose.positionX, normalizedPose.positionY, normalizedPose.positionZ] as [
        number,
        number,
        number
      ],
      target: [normalizedPose.targetX, normalizedPose.targetY, normalizedPose.targetZ] as [number, number, number]
    };

    if (!Array.isArray(settings.cameras)) {
      settings.cameras = [];
    }

    settings.cameras[0] = {
      ...(settings.cameras[0] ?? {}),
      initial
    };
  }

  return normalizedPose;
};

const applyPersistedViewerPreferences = () => {
  const settings = viewerRuntime.settingsJson as RuntimeSettingsJson | null;
  if (!settings) {
    return;
  }

  persistInitialCameraPose(getPersistedInitialCameraPose());
  hydrateSessionViewerPreferences();
};

const setCameraPanelEnabled = (enabled: boolean) => {
  elements.cameraPanel.dataset.disabled = enabled ? 'false' : 'true';
  const controls = [
    elements.cameraFovNumber,
    elements.cameraFovRange,
    elements.cameraPositionXNumber,
    elements.cameraPositionYNumber,
    elements.cameraPositionZNumber,
    elements.cameraTargetXNumber,
    elements.cameraTargetYNumber,
    elements.cameraTargetZNumber,
    elements.frameSceneButton,
    elements.modelRotationXNumber,
    elements.modelRotationXRange,
    elements.modelRotationYNumber,
    elements.modelRotationYRange,
    elements.modelRotationZNumber,
    elements.modelRotationZRange,
    elements.resetViewButton,
  ];

  for (const control of controls) {
    control.disabled = !enabled;
  }
};

const applyModelRotationControlsState = (
  sceneState: Partial<DesktopSceneTransformState> | null | undefined,
  force = false
) => {
  const normalizedState = normalizeSceneTransformState(sceneState);
  const activeElement = document.activeElement;

  syncingInspectorControls = true;

  try {
    for (const key of Object.keys(modelRotationInputMap) as Array<keyof typeof modelRotationInputMap>) {
      const value = normalizedState[key];
      const formattedValue = value.toFixed(1);
      const inputs = modelRotationInputMap[key];
      const fieldFocused = activeElement === inputs.number || activeElement === inputs.range;

      if (force || !fieldFocused) {
        inputs.number.value = formattedValue;
        inputs.range.value = formattedValue;
      }
    }
  } finally {
    syncingInspectorControls = false;
  }
};

const applyInitialCameraControlsState = (
  pose: Partial<DesktopInitialCameraPose> | null | undefined,
  force = false
) => {
  const normalizedPose = normalizeInitialCameraPose(pose);
  const activeElement = document.activeElement;

  syncingInspectorControls = true;

  try {
    for (const key of Object.keys(initialCameraNumericInputs) as Array<keyof typeof initialCameraNumericInputs>) {
      const input = initialCameraNumericInputs[key];
      if (force || activeElement !== input) {
        input.value = normalizedPose[key].toFixed(2);
      }
    }

    const fovFocused = activeElement === elements.cameraFovNumber || activeElement === elements.cameraFovRange;
    if (force || !fovFocused) {
      const formattedFov = normalizedPose.fov.toFixed(1);
      elements.cameraFovNumber.value = formattedFov;
      elements.cameraFovRange.value = formattedFov;
    }
  } finally {
    syncingInspectorControls = false;
  }
};

const syncInspectorControlsFromViewer = (force = false) => {
  if (state.uiState !== 'ready') {
    return;
  }

  const viewer = getActiveViewer();
  const sceneState = viewer?.getDesktopSceneTransform?.();
  const initialCameraPose = viewer?.getDesktopInitialCameraPose?.();

  if (sceneState) {
    applyModelRotationControlsState(sceneState, force);
  }

  if (initialCameraPose) {
    applyInitialCameraControlsState(initialCameraPose, force);
  }
};

const applyDesktopViewerDefaults = (viewer: ViewerInstance | null) => {
  if (!viewer) {
    return;
  }

  try {
    viewer.applyDesktopDefaults?.();
  } catch {}

  try {
    if (viewer.global?.state) {
      viewer.global.state.animationPaused = true;
      viewer.global.state.hasAnimation = false;
      if (viewer.global.state.cameraMode === 'anim') {
        viewer.global.state.cameraMode = 'orbit';
      }
    }
    viewer.global?.events?.fire?.('reset');
    if (viewer.global?.app) {
      viewer.global.app.renderNextFrame = true;
    }
  } catch {}
};

const applySceneTransformPatch = (patch: Partial<DesktopSceneTransformState>) => {
  const viewer = getActiveViewer();
  if (!viewer?.setDesktopSceneTransform) {
    rememberSessionRotation(patch);
    return;
  }

  const nextState = viewer.setDesktopSceneTransform(patch);
  rememberSessionRotation(nextState ?? patch);
  applyModelRotationControlsState(nextState, true);
};

const applyInitialCameraPosePatch = (patch: Partial<DesktopInitialCameraPose>) => {
  rememberSessionFov(patch.fov);
  const viewer = getActiveViewer();
  if (!viewer?.setDesktopInitialCameraPose) {
    persistInitialCameraPose(patch);
    return;
  }

  const nextPose = viewer.setDesktopInitialCameraPose(patch);
  rememberSessionFov(nextPose?.fov ?? patch.fov);
  const persistedPose = persistInitialCameraPose(nextPose ?? patch);
  applyInitialCameraControlsState(persistedPose, true);
};

const bindModelRotationField = (key: keyof typeof modelRotationInputMap) => {
  const inputs = modelRotationInputMap[key];

  const commitValue = (rawValue: string) => {
    if (syncingInspectorControls) {
      return;
    }

    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      syncInspectorControlsFromViewer(true);
      return;
    }

    const normalizedState = normalizeSceneTransformState({ [key]: numericValue } as Partial<DesktopSceneTransformState>);
    applySceneTransformPatch({ [key]: normalizedState[key] } as Partial<DesktopSceneTransformState>);
  };

  inputs.range.addEventListener('input', () => {
    commitValue(inputs.range.value);
  });

  inputs.number.addEventListener('change', () => {
    commitValue(inputs.number.value);
  });

  inputs.number.addEventListener('blur', () => {
    commitValue(inputs.number.value);
  });

  inputs.number.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      commitValue(inputs.number.value);
      inputs.number.blur();
    }
  });
};

const bindInitialCameraVectorField = (key: keyof typeof initialCameraNumericInputs) => {
  const input = initialCameraNumericInputs[key];

  const commitValue = (rawValue: string) => {
    if (syncingInspectorControls) {
      return;
    }

    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      syncInspectorControlsFromViewer(true);
      return;
    }

    const normalizedPose = normalizeInitialCameraPose({ [key]: numericValue } as Partial<DesktopInitialCameraPose>);
    applyInitialCameraPosePatch({ [key]: normalizedPose[key] } as Partial<DesktopInitialCameraPose>);
  };

  input.addEventListener('change', () => {
    commitValue(input.value);
  });

  input.addEventListener('blur', () => {
    commitValue(input.value);
  });

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      commitValue(input.value);
      input.blur();
    }
  });
};

const bindInitialCameraFovField = () => {
  const commitValue = (rawValue: string) => {
    if (syncingInspectorControls) {
      return;
    }

    const numericValue = Number(rawValue);
    if (!Number.isFinite(numericValue)) {
      syncInspectorControlsFromViewer(true);
      return;
    }

    const normalizedPose = normalizeInitialCameraPose({ fov: numericValue });
    applyInitialCameraPosePatch({ fov: normalizedPose.fov });
  };

  elements.cameraFovRange.addEventListener('input', () => {
    commitValue(elements.cameraFovRange.value);
  });

  elements.cameraFovNumber.addEventListener('change', () => {
    commitValue(elements.cameraFovNumber.value);
  });

  elements.cameraFovNumber.addEventListener('blur', () => {
    commitValue(elements.cameraFovNumber.value);
  });

  elements.cameraFovNumber.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      commitValue(elements.cameraFovNumber.value);
      elements.cameraFovNumber.blur();
    }
  });
};

const render = () => {
  const hasFile = Boolean(state.currentFile);
  const cameraPanelEnabled = hasFile && state.uiState === 'ready' && Boolean(getActiveViewer());
  const panelVisible = hasFile && state.inspectorOpen;

  document.body.dataset.hasFile = hasFile ? 'true' : 'false';
  document.body.dataset.inspectorOpen = panelVisible ? 'true' : 'false';
  document.body.dataset.uiState = state.uiState;
  document.body.dataset.loadingMode = state.loadingPercent === null ? 'indeterminate' : 'determinate';
  document.body.style.setProperty('--loading-progress', `${state.loadingPercent ?? 12}%`);

  elements.statusBadge.dataset.state = state.uiState;
  elements.statusBadge.textContent =
    state.uiState === 'loading' && state.loadingPercent !== null
      ? `${state.loadingPercent}%`
      : t(state.uiState);
  elements.viewerStateText.textContent = getViewerStateText();
  elements.sceneStats.textContent = getSceneStatsText();

  elements.emptyState.hidden = hasFile;
  elements.cameraPanel.hidden = !panelVisible;
  elements.fileName.textContent = state.currentFile?.name ?? 'SuperSplat Desktop Viewer';
  elements.filePath.textContent = state.currentFile?.path ?? '';
  elements.loadingOverlay.hidden = state.uiState !== 'loading';
  elements.loadingTitle.textContent = state.currentFile?.name ?? t('preparingScene');
  elements.loadingCaption.textContent = state.loadingCaption;
  elements.loadingPercent.textContent =
    state.loadingPercent !== null ? `${state.loadingPercent}%` : '...';
  elements.loadingFill.setAttribute('aria-valuenow', `${state.loadingPercent ?? 0}`);
  elements.togglePanelButton.hidden = !hasFile;
  setCameraPanelEnabled(cameraPanelEnabled);

  elements.messageBanner.hidden = !state.message;
  elements.messageBanner.dataset.kind = state.messageKind;
  elements.messageBanner.textContent = state.message;
};

const ensureViewerAssets = async () => {
  if (viewerRuntime.bodyMarkup && viewerRuntime.mainFn && viewerRuntime.settingsJson) {
    return;
  }

  const viewerModuleUrl = '/viewer/index.js';
  const [bodyResponse, settingsResponse, viewerModule] = await Promise.all([
    fetch('/viewer/viewer-body.html'),
    fetch('/viewer/settings.json'),
    import(/* @vite-ignore */ viewerModuleUrl) as Promise<{ main: ViewerMain }>
  ]);

  if (!bodyResponse.ok) {
    throw new Error(`viewer-body.html is unavailable: ${bodyResponse.status}`);
  }

  if (!settingsResponse.ok) {
    throw new Error(`settings.json is unavailable: ${settingsResponse.status}`);
  }

  viewerRuntime.bodyMarkup = await bodyResponse.text();
  const bodyTemplate = document.createElement('template');
  bodyTemplate.innerHTML = viewerRuntime.bodyMarkup;
  viewerRuntime.bodyTemplate = bodyTemplate;
  viewerRuntime.settingsJson = await settingsResponse.json();
  applyPersistedViewerPreferences();
  viewerRuntime.mainFn = viewerModule.main;
};

const createViewerSessionTracker = () => {
  const listenerRecords: Array<{
    listener: EventListenerOrEventListenerObject;
    options?: AddEventListenerOptions | boolean;
    target: EventTarget;
    type: string;
  }> = [];
  const restoreCallbacks: Array<() => void> = [];
  const timeoutIds = new Set<number>();
  const intervalIds = new Set<number>();
  const animationFrameIds = new Set<number>();
  const resizeObservers = new Set<ResizeObserver>();

  const patchEventTarget = (
    target: EventTarget & {
      addEventListener: typeof window.addEventListener;
      removeEventListener: typeof window.removeEventListener;
    }
  ) => {
    const originalAdd = target.addEventListener.bind(target);
    const originalRemove = target.removeEventListener.bind(target);

    (target as typeof target & { addEventListener: typeof window.addEventListener }).addEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: AddEventListenerOptions | boolean
    ) => {
      if (listener) {
        listenerRecords.push({ listener, options, target, type });
      }
      originalAdd(type, listener, options);
    }) as typeof window.addEventListener;

    (target as typeof target & { removeEventListener: typeof window.removeEventListener }).removeEventListener = ((
      type: string,
      listener: EventListenerOrEventListenerObject | null,
      options?: AddEventListenerOptions | boolean
    ) => {
      originalRemove(type, listener, options);
    }) as typeof window.removeEventListener;

    restoreCallbacks.push(() => {
      (target as typeof target & { addEventListener: typeof window.addEventListener }).addEventListener =
        originalAdd as typeof window.addEventListener;
      (target as typeof target & { removeEventListener: typeof window.removeEventListener }).removeEventListener =
        originalRemove as typeof window.removeEventListener;
    });
  };

  patchEventTarget(window);
  patchEventTarget(document);
  patchEventTarget(document.body);

  const originalSetTimeout = window.setTimeout.bind(window);
  const originalClearTimeout = window.clearTimeout.bind(window);
  const originalSetInterval = window.setInterval.bind(window);
  const originalClearInterval = window.clearInterval.bind(window);
  const originalRequestAnimationFrame = window.requestAnimationFrame.bind(window);
  const originalCancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  const OriginalResizeObserver = window.ResizeObserver;

  window.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const id = originalSetTimeout(handler, timeout, ...args);
    timeoutIds.add(id);
    return id;
  }) as typeof window.setTimeout;

  window.clearTimeout = ((id?: number) => {
    if (typeof id === 'number') {
      timeoutIds.delete(id);
    }
    originalClearTimeout(id);
  }) as typeof window.clearTimeout;

  window.setInterval = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    const id = originalSetInterval(handler, timeout, ...args);
    intervalIds.add(id);
    return id;
  }) as typeof window.setInterval;

  window.clearInterval = ((id?: number) => {
    if (typeof id === 'number') {
      intervalIds.delete(id);
    }
    originalClearInterval(id);
  }) as typeof window.clearInterval;

  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    const id = originalRequestAnimationFrame((time) => {
      animationFrameIds.delete(id);
      callback(time);
    });
    animationFrameIds.add(id);
    return id;
  }) as typeof window.requestAnimationFrame;

  window.cancelAnimationFrame = ((id: number) => {
    animationFrameIds.delete(id);
    originalCancelAnimationFrame(id);
  }) as typeof window.cancelAnimationFrame;

  class TrackingResizeObserver extends OriginalResizeObserver {
    constructor(callback: ResizeObserverCallback) {
      super(callback);
      resizeObservers.add(this);
    }
  }

  window.ResizeObserver = TrackingResizeObserver as typeof ResizeObserver;

  return () => {
    for (const id of timeoutIds) {
      originalClearTimeout(id);
    }

    for (const id of intervalIds) {
      originalClearInterval(id);
    }

    for (const id of animationFrameIds) {
      originalCancelAnimationFrame(id);
    }

    for (const observer of resizeObservers) {
      observer.disconnect();
    }

    for (const { listener, options, target, type } of listenerRecords) {
      target.removeEventListener(type, listener, options);
    }

    window.setTimeout = originalSetTimeout;
    window.clearTimeout = originalClearTimeout;
    window.setInterval = originalSetInterval;
    window.clearInterval = originalClearInterval;
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
    window.ResizeObserver = OriginalResizeObserver;

    for (const restore of restoreCallbacks.reverse()) {
      restore();
    }
  };
};

const destroyMountedViewer = (mounted: MountedViewer | null) => {
  if (!mounted) {
    return;
  }

  try {
    mounted.cleanup();
  } finally {
    mounted.root.remove();
  }
};

const clampProgress = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

const installViewerLoadingBridge = (slotRoot: HTMLElement, requestId: string) => {
  const loadingWrap = slotRoot.querySelector('#loadingWrap') as HTMLDivElement | null;
  const loadingText = slotRoot.querySelector('#loadingText') as HTMLDivElement | null;

  if (!loadingWrap || !loadingText) {
    return () => {};
  }

  const sync = () => {
    if (requestId !== state.currentRequestId || state.uiState !== 'loading') {
      return;
    }

    const text = loadingText.textContent?.trim() ?? '';
    const match = text.match(/(\d{1,3})%/);
    const progress = match ? clampProgress(Number(match[1])) : null;
    state.loadingPercent = progress;
      state.loadingCaption =
        loadingWrap.classList.contains('hidden') || progress === 100
          ? t('preparingFirstFrame')
          : t('streamingData');
    render();
  };

  const observer = new MutationObserver(sync);
  observer.observe(loadingWrap, { attributes: true, attributeFilter: ['class'] });
  observer.observe(loadingText, { childList: true, characterData: true, subtree: true });
  sync();

  return () => {
    observer.disconnect();
  };
};

const createViewerSlot = () => {
  const root = document.createElement('div');
  root.className = 'viewer-slot viewer-slot--active';
  root.append(viewerRuntime.bodyTemplate?.content.cloneNode(true) ?? document.createTextNode(''));
  elements.viewerViewport.append(root);
  return root;
};

const mountViewer = async (
  requestId: string,
  preparedContent: { contentUrl: string; contents: Promise<Response> }
) => {
  await ensureViewerAssets();
  viewerRuntime.nextSessionId += 1;
  const slotRoot = createViewerSlot();
  const cleanupTracker = createViewerSessionTracker();
  const loadStartedAt = performance.now();
  let disconnectLoadingObserver = () => {};
  let viewer: ViewerInstance | null = null;
  let settled = false;
  let firstFrameCallback: (() => void) | undefined;

  const removeCurrentFirstFrame = () => {
    if (window.firstFrame === firstFrameCallback) {
      window.firstFrame = undefined;
    }
  };

  const finalizeCleanup = (viewer?: ViewerInstance | null) => {
    try {
      viewer?.walkCursor?.destroy?.();
    } catch {}

    try {
      viewer?.voxelOverlay?.destroy?.();
    } catch {}

    try {
      viewer?.inputController?.destroy?.();
    } catch {}

    try {
      viewer?.cameraFrame?.destroy?.();
    } catch {}

    try {
      viewer?.annotations?.parentDom?.remove();
    } catch {}

    try {
      viewer?.global?.app?.destroy?.();
    } catch {}

    disconnectLoadingObserver();
    removeCurrentFirstFrame();
    cleanupTracker();
  };

  const canvas = slotRoot.querySelector('#application-canvas');
  if (!(canvas instanceof HTMLCanvasElement) || !viewerRuntime.mainFn) {
    finalizeCleanup(null);
    slotRoot.remove();
    throw new Error('Failed to mount upstream viewer canvas.');
  }

  disconnectLoadingObserver = installViewerLoadingBridge(slotRoot, requestId);

  let rejectReady: ((reason?: unknown) => void) | null = null;

  const onViewerError = (message: string) => {
    if (settled) {
      return;
    }

    settled = true;
    rejectReady?.(new Error(message));
  };

  const handleFirstFrame = () => {
    if (settled) {
      return;
    }

    settled = true;
    state.loadingPercent = 100;
    state.loadingCaption = t('preparingFirstFrame');
    render();
  };

  const readyPromise = new Promise<number>((resolve, reject) => {
    rejectReady = reject;
    firstFrameCallback = () => {
      handleFirstFrame();
      resolve(performance.now() - loadStartedAt);
    };
    window.firstFrame = firstFrameCallback;
  });

  const errorHandler = (event: ErrorEvent) => {
    if (requestId !== state.currentRequestId || state.uiState !== 'loading') {
      return;
    }

    onViewerError(extractErrorMessage(event.error ?? event.message, t('sceneOpenError')));
  };

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    if (requestId !== state.currentRequestId || state.uiState !== 'loading') {
      return;
    }

    onViewerError(extractErrorMessage(event.reason, t('sceneOpenError')));
  };

  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);

  const runtimeSettings = cloneSettingsJson(viewerRuntime.settingsJson as RuntimeSettingsJson);
  applySessionFovToSettings(runtimeSettings);

  const baseConfig: ViewerConfig = {
    contentUrl: preparedContent.contentUrl,
    contents: preparedContent.contents,
    noanim: true,
    reorder: !preparedContent.contentUrl.toLowerCase().endsWith('.ply'),
    sceneTransform: getSessionSceneTransform()
  };

  try {
    state.loadingCaption = t('viewerInit');
    render();
    viewer = await viewerRuntime.mainFn(canvas, runtimeSettings, baseConfig);
    state.loadingCaption = t('loading');
    render();
    const mounted: MountedViewer = {
      cleanup: () => {
        finalizeCleanup(viewer);
      },
      root: slotRoot,
      viewer
    };

    const loadMs = await readyPromise;
    removeCurrentFirstFrame();
    applyDesktopViewerDefaults(viewer);

    return {
      loadMs,
      mounted
    };
  } catch (error) {
    removeCurrentFirstFrame();
    finalizeCleanup(viewer);
    slotRoot.remove();
    throw error;
  }
};

const activateMountedViewer = (result: { loadMs: number; mounted: MountedViewer }) => {
  viewerRuntime.activeViewer = result.mounted;
  state.lastLoadMs = result.loadMs;
  state.loadingPercent = 100;
  state.loadingCaption = t('ready');
  state.sceneNumSplats = result.mounted.viewer?.getDesktopSceneStats?.()?.numSplats ?? null;
  rememberSessionRotation(result.mounted.viewer?.getDesktopSceneTransform?.());
  rememberSessionFov(result.mounted.viewer?.getDesktopInitialCameraPose?.()?.fov);
  state.uiState = 'ready';
  render();
  syncInspectorControlsFromViewer(true);
};

const cleanupAllViewers = () => {
  destroyMountedViewer(viewerRuntime.activeViewer);
  viewerRuntime.activeViewer = null;
  window.firstFrame = undefined;
  window.scrubTo = undefined;
  window.animationDuration = undefined;
};

const waitForViewerCleanup = async () => {
  await new Promise<void>((resolve) => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => resolve());
    });
  });
};

const createPreparedContent = async (payload: OpenFilePayload): Promise<PreparedContent> => {
  const streamSession = await openLocalHttpStream(payload.path);
  if (!streamSession) {
    throw new Error(t('streamOpenFailed'));
  }

  let disposed = false;

  const dispose = async () => {
    if (disposed) {
      return;
    }

    disposed = true;
    try {
      await closeLocalHttpStream(streamSession.sessionId);
    } catch {}
  };

  return {
    contentUrl: streamSession.streamUrl,
    contents: fetch(streamSession.streamUrl, {
      cache: 'no-store'
    }),
    dispose
  };
};

const openFromPayload = async (payload: OpenFilePayload) => {
  if (state.uiState === 'loading') {
    showWarning(t('waitCurrentLoad'));
    return;
  }

  clearIssueState();
  state.currentFile = payload;
  state.uiState = 'loading';
  const requestId = nextRequestId();
  state.currentRequestId = requestId;
  state.loadingCaption = t('openScene');
  state.loadingPercent = null;
  render();

  let preparedContent: PreparedContent | null = null;

  try {
    preparedContent = await createPreparedContent(payload);
    const response = await preparedContent.contents;
    if (!response.ok) {
      throw new Error(`Failed to read file: ${response.status}`);
    }

    if (requestId !== state.currentRequestId) {
      return;
    }

    preparedContent.contents = Promise.resolve(response);
    state.loadingCaption = t('preparingNewScene');
    render();

    cleanupAllViewers();
    await waitForViewerCleanup();

    if (requestId !== state.currentRequestId) {
      return;
    }

    const result = await mountViewer(requestId, preparedContent);
    if (requestId !== state.currentRequestId) {
      destroyMountedViewer(result.mounted);
      await preparedContent.dispose();
      return;
    }

    activateMountedViewer(result);
    await preparedContent.dispose();
  } catch (error) {
    await preparedContent?.dispose();
    if (requestId !== state.currentRequestId) {
      return;
    }

    await setFatalError(extractErrorMessage(error, t('sceneOpenError')));
  }
};

const openFromDialog = async () => {
  const selected = await openDialog({
    filters: [
      {
        extensions: ['ply', 'sog', 'json'],
        name: '3DGS scenes'
      }
    ],
    multiple: false,
    title: 'Open 3D Gaussian Splat Scene'
  });

  if (typeof selected !== 'string') {
    return;
  }

  const payload = await resolveFilePath(selected);
  if (!payload) {
    showWarning(t('unsupportedFiles'));
    return;
  }

  await openFromPayload(payload);
};

const handleIncomingPayload = async (payload: OpenFilePayload | null) => {
  if (!payload) {
    return;
  }

  await openFromPayload(payload);
};

const handleNativeDropPath = async (filePath: string | null | undefined) => {
  if (!filePath) {
    showWarning('Failed to resolve the dropped file path.');
    return;
  }

  const payload = await resolveFilePath(filePath);
  if (!payload) {
    showWarning(t('unsupportedFiles'));
    return;
  }

  await openFromPayload(payload);
};

const installDragAndDrop = async () => {
  const currentWindow = getCurrentWindow();
  return currentWindow.onDragDropEvent(({ payload }) => {
    if (payload.type === 'drop') {
      void handleNativeDropPath(payload.paths[0]);
    }
  });
};

const init = async () => {
  state.inspectorOpen = false;
  applyStaticText();
  applyModelRotationControlsState(DEFAULT_SCENE_TRANSFORM, true);
  applyInitialCameraControlsState(getPersistedInitialCameraPose(), true);
  state.loadingCaption = t('selectLocalScene');
  render();

  bindModelRotationField('rotationX');
  bindModelRotationField('rotationY');
  bindModelRotationField('rotationZ');
  bindInitialCameraVectorField('positionX');
  bindInitialCameraVectorField('positionY');
  bindInitialCameraVectorField('positionZ');
  bindInitialCameraVectorField('targetX');
  bindInitialCameraVectorField('targetY');
  bindInitialCameraVectorField('targetZ');
  bindInitialCameraFovField();

  elements.openFileButton.addEventListener('click', () => {
    void openFromDialog();
  });
  elements.emptyOpenButton.addEventListener('click', () => {
    void openFromDialog();
  });
  elements.togglePanelButton.addEventListener('click', () => {
    state.inspectorOpen = !state.inspectorOpen;
    render();
  });
  elements.frameSceneButton.addEventListener('click', () => {
    const nextState = getActiveViewer()?.frameDesktopScene?.();
    if (nextState) {
      window.setTimeout(() => {
        syncInspectorControlsFromViewer(true);
      }, 80);
    }
  });
  elements.resetViewButton.addEventListener('click', () => {
    const nextState = getActiveViewer()?.resetDesktopCamera?.();
    if (nextState) {
      window.setTimeout(() => {
        syncInspectorControlsFromViewer(true);
      }, 80);
    }
  });

  const disposeDragDrop = await installDragAndDrop();
  const disposeFileOpen = await getCurrentWindow().listen<OpenFilePayload>(FILE_OPEN_EVENT, ({ payload }) => {
    void handleIncomingPayload(payload);
  });

  window.addEventListener('beforeunload', () => {
    cleanupAllViewers();
    disposeDragDrop();
    disposeFileOpen();
  });

  void ensureViewerAssets().catch(() => {
    // Viewer assets are also loaded on demand during the first open.
  });

  await handleIncomingPayload(await getLaunchFile());
};

void init();
