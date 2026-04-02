# SuperSplat Desktop Viewer Tauri

Лёгкий офлайн-просмотрщик сцен 3D Gaussian Splat для Windows на базе Tauri, TypeScript и `@playcanvas/supersplat-viewer`.

## Что внутри

- нативная Windows-обвязка на Tauri вместо Electron
- открытие `.ply`, `.sog`, `.meta.json`, `.lod-meta.json`
- `Open with...`, drag-and-drop и системный file-open сценарий
- отключённое автокручение сцены
- UI-статусы и overlay загрузки
- оптимизация для `.ply`: пропуск `reorderData()` в desktop-режиме

## Разработка

Требования:

- Node.js
- Rust toolchain
- Windows SDK / MSVC Build Tools
- WebView2 Runtime в системе

Команды:

```bash
npm install
npm run typecheck
npm run build
npm run dist
```

## Сборка

- `npm run build` собирает frontend и готовит viewer-assets
- `npm run dist` собирает Windows `exe` и NSIS installer

Готовые артефакты локально появляются в:

- `src-tauri/target/release/tauri-viewer.exe`
- `src-tauri/target/release/bundle/nsis/`

## Примечание

Сгенерированные папки `dist`, `public/viewer`, `public/licenses` и `src-tauri/target` не коммитятся. Они восстанавливаются через скрипты сборки.
