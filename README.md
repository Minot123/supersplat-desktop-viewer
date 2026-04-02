# SuperSplat Desktop Viewer

Lightweight offline Windows desktop viewer for 3D Gaussian Splat scenes, built with Tauri, TypeScript, and `@playcanvas/supersplat-viewer`.

## Features

- Native Windows shell on Tauri instead of Electron
- Open `.ply`, `.sog`, `.meta.json`, and `.lod-meta.json`
- `Open with...`, drag-and-drop, and OS file-open flow
- Disabled autoplay / auto-rotation
- Desktop camera and scene controls
- Loading overlay and scene status UI
- Session-level persistence for `Field of View` and model rotation
- English UI by default with an in-app `EN/RU` language toggle
- Streamed local file loading path for large scenes

## Requirements

- Node.js
- Rust toolchain
- Windows SDK / MSVC Build Tools
- WebView2 Runtime installed on the system

## Development

```bash
npm install
npm run typecheck
npm run build
npm run dist
```

## Build Outputs

- `npm run build` prepares viewer assets and builds the frontend
- `npm run dist` creates the Windows executable and the NSIS installer

Local artifacts are generated in:

- `src-tauri/target/release/supersplat-desktop-viewer.exe`
- `src-tauri/target/release/bundle/nsis/`

## Notes

- Generated folders such as `dist`, `public/viewer`, `public/licenses`, and `src-tauri/target` are not committed
- Large-scene loading is tuned for stability first; the current local streaming path avoids the WebView2 crash seen on repeated heavy scene opens

---

## Русская версия

Лёгкий офлайн-просмотрщик сцен 3D Gaussian Splat для Windows на базе Tauri, TypeScript и `@playcanvas/supersplat-viewer`.

### Возможности

- Нативная Windows-обвязка на Tauri вместо Electron
- Открытие `.ply`, `.sog`, `.meta.json`, `.lod-meta.json`
- `Open with...`, drag-and-drop и системный file-open сценарий
- Отключённое автопроигрывание и автокручение сцены
- Управление камерой и сценой в desktop UI
- Overlay загрузки и статусные состояния
- Сессионное сохранение `Field of View` и поворота модели
- Английский UI по умолчанию и переключатель `EN/RU` в приложении
- Потоковый путь чтения локальных файлов для больших сцен

### Требования

- Node.js
- Rust toolchain
- Windows SDK / MSVC Build Tools
- Установленный WebView2 Runtime

### Разработка

```bash
npm install
npm run typecheck
npm run build
npm run dist
```

### Сборка

- `npm run build` подготавливает viewer-assets и собирает frontend
- `npm run dist` собирает Windows `exe` и NSIS installer

Локальные артефакты появляются в:

- `src-tauri/target/release/supersplat-desktop-viewer.exe`
- `src-tauri/target/release/bundle/nsis/`

### Примечания

- Генерируемые папки `dist`, `public/viewer`, `public/licenses` и `src-tauri/target` не коммитятся
- Загрузка больших сцен сейчас оптимизирована в первую очередь под стабильность; текущий потоковый путь чтения уводит приложение от WebView2-crash, который проявлялся при повторном открытии тяжёлых сцен
