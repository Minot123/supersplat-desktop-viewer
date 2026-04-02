import './styles.css';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { SUPPORTED_FILE_LABELS, type OpenFilePayload } from './shared/files';

type UiState = 'idle' | 'loading' | 'ready' | 'error';

type ViewerConfig = {
  contentUrl: string;
  contents: Promise<Response>;
  noanim: boolean;
  reorder?: boolean;
};

type ViewerApp = {
  destroy?: () => void;
};

type ViewerInstance = {
  annotations?: { parentDom?: HTMLElement | null } | null;
  cameraFrame?: { destroy?: () => void } | null;
  global?: { app?: ViewerApp } | null;
  inputController?: { destroy?: () => void } | null;
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
};

declare global {
  interface Window {
    animationDuration?: number;
    firstFrame?: () => void;
    scrubTo?: (time: number) => Promise<void>;
  }
}

const FILE_OPEN_EVENT = 'file-open';

const state = {
  currentFile: null as OpenFilePayload | null,
  currentRequestId: '',
  lastLoadMs: null as number | null,
  loadingCaption: 'Выберите локальную сцену для просмотра',
  loadingPercent: null as number | null,
  message: '',
  messageKind: 'error' as 'error' | 'warning',
  uiState: 'idle' as UiState
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

const elements = {
  emptyOpenButton: document.getElementById('emptyOpenButton') as HTMLButtonElement,
  emptyState: document.getElementById('emptyState') as HTMLDivElement,
  filePath: document.getElementById('filePath') as HTMLSpanElement,
  fileMeta: document.getElementById('fileMeta') as HTMLDivElement,
  fileName: document.getElementById('fileName') as HTMLSpanElement,
  formatsList: document.getElementById('formatsList') as HTMLDivElement,
  loadingCaption: document.getElementById('loadingCaption') as HTMLSpanElement,
  loadingFill: document.getElementById('loadingFill') as HTMLDivElement,
  loadingOverlay: document.getElementById('loadingOverlay') as HTMLDivElement,
  loadingPercent: document.getElementById('loadingPercent') as HTMLSpanElement,
  loadingTitle: document.getElementById('loadingTitle') as HTMLDivElement,
  messageBanner: document.getElementById('messageBanner') as HTMLDivElement,
  openFileButton: document.getElementById('openFileButton') as HTMLButtonElement,
  statusBadge: document.getElementById('statusBadge') as HTMLDivElement,
  viewerStateText: document.getElementById('viewerStateText') as HTMLDivElement,
  viewerViewport: document.getElementById('viewerViewport') as HTMLDivElement
};

const STATUS_TEXT: Record<UiState, string> = {
  error: 'Ошибка загрузки',
  idle: 'Ожидание файла',
  loading: 'Загрузка сцены',
  ready: 'Сцена готова'
};

const getLaunchFile = () => invoke<OpenFilePayload | null>('get_launch_file');
const resolveFilePath = (filePath: string) =>
  invoke<OpenFilePayload | null>('resolve_file_path', { filePath });
const reportRendererError = (message: string) => invoke('report_renderer_error', { message });

const formatDuration = (durationMs: number) =>
  durationMs < 1000 ? `${Math.round(durationMs)} мс` : `${(durationMs / 1000).toFixed(2)} с`;

const getViewerStateText = () => {
  switch (state.uiState) {
    case 'error':
      return 'Viewer сообщил об ошибке при открытии локальной сцены';
    case 'loading':
      return state.loadingPercent !== null
        ? `Загрузка ${state.loadingPercent}%`
        : state.loadingCaption;
    case 'ready':
      return state.lastLoadMs
        ? `Сцена готова за ${formatDuration(state.lastLoadMs)}`
        : 'Навигация активна, можно открывать следующий файл';
    case 'idle':
    default:
      return 'Выберите локальную сцену для просмотра';
  }
};

const renderFormats = () => {
  elements.formatsList.replaceChildren(
    ...SUPPORTED_FILE_LABELS.map((extension) => {
      const pill = document.createElement('span');
      pill.className = 'formats-pill';
      pill.textContent = extension;
      return pill;
    })
  );
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
  state.loadingCaption = 'Подготавливаем сцену';
  state.loadingPercent = null;
  state.message = '';
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

const render = () => {
  const hasFile = Boolean(state.currentFile);

  document.body.dataset.hasFile = hasFile ? 'true' : 'false';
  document.body.dataset.uiState = state.uiState;
  document.body.dataset.loadingMode = state.loadingPercent === null ? 'indeterminate' : 'determinate';
  document.body.style.setProperty('--loading-progress', `${state.loadingPercent ?? 12}%`);

  elements.statusBadge.dataset.state = state.uiState;
  elements.statusBadge.textContent =
    state.uiState === 'loading' && state.loadingPercent !== null
      ? `${state.loadingPercent}%`
      : STATUS_TEXT[state.uiState];
  elements.viewerStateText.textContent = getViewerStateText();

  elements.emptyState.hidden = hasFile;
  elements.fileMeta.hidden = !hasFile;
  elements.fileName.textContent = state.currentFile?.name ?? 'Не выбран';
  elements.filePath.textContent = state.currentFile?.path ?? 'Путь недоступен';
  elements.loadingOverlay.hidden = state.uiState !== 'loading';
  elements.loadingTitle.textContent = state.currentFile?.name ?? 'Подготавливаем сцену';
  elements.loadingCaption.textContent = state.loadingCaption;
  elements.loadingPercent.textContent =
    state.loadingPercent !== null ? `${state.loadingPercent}%` : '...';
  elements.loadingFill.setAttribute('aria-valuenow', `${state.loadingPercent ?? 0}`);

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
    throw new Error(`viewer-body.html недоступен: ${bodyResponse.status}`);
  }

  if (!settingsResponse.ok) {
    throw new Error(`settings.json недоступен: ${settingsResponse.status}`);
  }

  viewerRuntime.bodyMarkup = await bodyResponse.text();
  const bodyTemplate = document.createElement('template');
  bodyTemplate.innerHTML = viewerRuntime.bodyMarkup;
  viewerRuntime.bodyTemplate = bodyTemplate;
  viewerRuntime.settingsJson = await settingsResponse.json();
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
        ? 'Подготавливаем первый кадр'
        : 'Загружаем данные сцены';
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
    throw new Error('Не удалось смонтировать canvas upstream viewer.');
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
    state.loadingCaption = 'Готовим переключение сцены';
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

    onViewerError(extractErrorMessage(event.error ?? event.message, 'Viewer не смог открыть сцену.'));
  };

  const rejectionHandler = (event: PromiseRejectionEvent) => {
    if (requestId !== state.currentRequestId || state.uiState !== 'loading') {
      return;
    }

    onViewerError(extractErrorMessage(event.reason, 'Viewer не смог открыть сцену.'));
  };

  window.addEventListener('error', errorHandler);
  window.addEventListener('unhandledrejection', rejectionHandler);

  const baseConfig: ViewerConfig = {
    contentUrl: preparedContent.contentUrl,
    contents: preparedContent.contents,
    noanim: true,
    reorder: !preparedContent.contentUrl.toLowerCase().endsWith('.ply')
  };

  try {
    state.loadingCaption = 'Инициализируем PlayCanvas viewer';
    render();
    viewer = await viewerRuntime.mainFn(canvas, viewerRuntime.settingsJson, baseConfig);
    state.loadingCaption = 'Загружаем сцену';
    render();
    const mounted: MountedViewer = {
      cleanup: () => {
        finalizeCleanup(viewer);
      },
      root: slotRoot
    };

    const loadMs = await readyPromise;
    removeCurrentFirstFrame();

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
  state.loadingCaption = 'Сцена готова';
  state.uiState = 'ready';
  render();
};

const cleanupAllViewers = () => {
  destroyMountedViewer(viewerRuntime.activeViewer);
  viewerRuntime.activeViewer = null;
  window.firstFrame = undefined;
  window.scrubTo = undefined;
  window.animationDuration = undefined;
};

const openFromPayload = async (payload: OpenFilePayload) => {
  clearIssueState();
  state.currentFile = payload;
  state.uiState = 'loading';
  const requestId = nextRequestId();
  state.currentRequestId = requestId;
  state.loadingCaption = 'Читаем локальный файл';
  state.loadingPercent = null;
  render();

  const contentUrl = convertFileSrc(payload.path);
  const preparedContent = {
    contentUrl,
    contents: fetch(contentUrl)
  };

  try {
    state.loadingCaption = 'Проверяем локальный файл';
    render();
    const response = await preparedContent.contents;
    if (!response.ok) {
      throw new Error(`Не удалось прочитать файл: ${response.status}`);
    }

    if (requestId !== state.currentRequestId) {
      return;
    }

    preparedContent.contents = Promise.resolve(response);
    state.loadingCaption = 'Подготавливаем новую сцену';
    render();
    destroyMountedViewer(viewerRuntime.activeViewer);
    viewerRuntime.activeViewer = null;

    if (requestId !== state.currentRequestId) {
      return;
    }

    const result = await mountViewer(requestId, preparedContent);
    if (requestId !== state.currentRequestId) {
      destroyMountedViewer(result.mounted);
      return;
    }

    activateMountedViewer(result);
  } catch (error) {
    if (requestId !== state.currentRequestId) {
      return;
    }

    await setFatalError(extractErrorMessage(error, 'Viewer не смог открыть сцену.'));
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
    showWarning('Поддерживаются только локальные файлы .ply, .sog, .meta.json и .lod-meta.json.');
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
    showWarning('Не удалось определить путь к перетащенному файлу.');
    return;
  }

  const payload = await resolveFilePath(filePath);
  if (!payload) {
    showWarning('Поддерживаются только локальные файлы .ply, .sog, .meta.json и .lod-meta.json.');
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
  renderFormats();
  render();

  elements.openFileButton.addEventListener('click', () => {
    void openFromDialog();
  });
  elements.emptyOpenButton.addEventListener('click', () => {
    void openFromDialog();
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
