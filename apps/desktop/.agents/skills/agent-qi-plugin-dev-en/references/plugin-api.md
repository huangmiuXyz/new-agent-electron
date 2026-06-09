# Plugin API Notes

Use this file when implementing plugin code or checking available context APIs. Primary sources:

- `packages/types/src/plugin.ts`
- `packages/types/src/electron.ts`
- `packages/types/src/components.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/src/services/plugins/pluginManager.ts`

## Core Interfaces

### Plugin

- `name: string`
- `version?: string`
- `description?: string`
- `updatedAt?: string`
- `readme?: string`
- `install(context): void | Promise<void>`
- `uninstall?(context): void | Promise<void>`

### PluginContext: Common APIs

- lifecycle and app context
  - `app`, `pinia`, `router`, `basePath`
  - `execNodejs(options)`
- provider / registry
  - `registerProvider(providerId, options)`
  - `unregisterProvider(providerId)`
  - `registerRegistry(name, factory, options?)`
  - `unregisterRegistry(name)`
  - `getRegisteredProviders()`
- tools / hooks / commands
  - `registerBuiltinTool(name, tool)`
  - `unregisterBuiltinTool(name)`
  - `registerHook(name, handler)`
  - `registerCommand(name, handler)`
- UI
  - `registerSettings(component)`
  - `unregisterSettings()`
  - `useForm()`
  - `useTable()`
  - `useModal()`
  - `useDownload()`
  - `useIcon()`
  - `useTerminal()`
  - `components`
  - `vue.ref/reactive/computed/watch/onMounted/onUnmounted/nextTick/markRaw/h/defineComponent/toRaw/toRef/toRefs/isRef/isReactive`
- storage / app state
  - `localforage.getItem/setItem/removeItem`
  - `getStore('settings')`
  - `getPluginsDataPath()`
- feedback
  - `notification.success/info/warning/error/loading/status/removeStatus`

## `execNodejs()`

Use `context.execNodejs()` when the plugin needs to run bundled Node.js code in a separate process. It is safer than manually shelling out for plugin-local scripts because `PluginManager.createContext()` defaults:

- `cwd` to `basePath`
- `moduleBasePath` to `basePath`
- args and env are cloned into plain serializable data

Good fit:

- local HTTP bridge services
- plugin-bundled scripts
- tasks that need plugin-local npm dependencies

Example source: `packages/qi-cli/example/agent-qi-openai-server-plugin`.

## `context.api` Surface

Do not reduce `context.api` to only `fs/path/os/spawn`. Check `packages/types/src/electron.ts` before using an API.

### Process And System

- `api.process.platform/env/execPath`
- `api.os`
- `api.exec`
- `api.spawn`
- `api.fork`
- `api.execNodejs`
- `api.execFileCommand()`

Use for local services, environment inspection, external commands, and executable-specific calls.

### Files And Paths

- `api.fs`
- `api.path`
- `api.watch(path, callback)`
- `api.getPath(name)`
- `api.getAppPath()`
- `api.getPluginsPath()`
- `api.getBundledRipgrepPath()`

Use for plugin files, directories, watching, app paths, user data paths, and bundled ripgrep.

### Shell, Clipboard, URL, MIME

- `api.shell`
- `api.clipboard.writeText()`
- `api.clipboard.readText()`
- `api.url`
- `api.mime`

Use for opening external files/links, copy/paste flows, and URL/MIME handling.

### Dialog And App Capabilities

- `api.showOpenDialog()`
- `api.app`
- `api.openDevTools()`
- `api.isPackaged`

Use for native selection dialogs, package-mode checks, and app metadata.

### PTY And Terminal

- `api.pty.spawn()`
- `api.pty.write()`
- `api.pty.resize()`
- `api.pty.kill()`
- `api.pty.onData()`
- `api.pty.onExit()`

Use for interactive terminal experiences and long-running shell sessions.

### Network And Download

- `api.net.fetch()`
- `api.net.download()`
- `api.net.onDownloadProgress()`
- `api.net.cancelDownload()`

Use for main-process networking and large downloads with progress.

Prefer `context.useDownload()` when you want plugin-scoped task state and UI-friendly progress.

### SQLite And Local Indexing

- `api.sqlite.isSupported()`
- `api.sqlite.upsertChunks()`
- `api.sqlite.updateChunks()`
- `api.sqlite.deleteChunksByDoc()`
- `api.sqlite.deleteChunksByKb()`
- `api.sqlite.getChunkCountsByDoc()`
- `api.sqlite.search()`
- `api.sqlite.getAllChunks()`
- `api.sqlite.getChunksByHash()`

Use for knowledge-base, embedding, or local indexing plugins.

### Apply Patch

- `api.applyPatch.execute(...)`

Use for controlled file edits or patch-based batch changes.

### Sync Features

- `api.sync.startHost()`
- `api.sync.stopHost()`
- `api.sync.getHostState()`
- `api.sync.updateProfile()`
- `api.sync.publishSnapshot()`
- `api.sync.listEndpoints()`
- `api.sync.getEndpointSnapshot()`
- `api.sync.onEvent()`

Use for LAN/device sync plugins.

### Computer Control

- `api.computer.isAvailable()`
- `api.computer.getScreenSize()`
- `api.computer.getMousePosition()`
- `api.computer.moveMouse()`
- `api.computer.mouseClick()`
- `api.computer.dragMouse()`
- `api.computer.scrollMouse()`
- `api.computer.typeText()`
- `api.computer.keyTap()`
- `api.computer.getPixelColor()`
- `api.computer.captureScreen()`

Use for desktop automation, screenshots, and mouse/keyboard control.

### Windows And Updater

- `api.setTitleBarTheme()`
- `api.createTempChat()`
- `api.getTempChatData()`
- `api.updater.getVersion()`
- `api.updater.checkForUpdates()`
- `api.updater.downloadUpdate()`
- `api.updater.quitAndInstall()`
- `api.updater.onStatus()`

Use for window behavior, temporary chat flows, and update state.

## Provider Patterns

### `registerRegistry()`

- Adds a provider factory to the chat service registry.
- The registry name usually becomes `providerType`.
- `{ hide: true }` lets a factory exist without appearing in provider type selectors.
- Use this when the app must know how to instantiate a provider implementation.

### `registerProvider()`

- Writes a plugin-owned provider record into `settings.registeredProviders`.
- The UI merges built-in `providers` with `registeredProviders` through `getAllProviders`.
- Repeated calls update the existing plugin-owned provider record.
- Use this when a provider should appear in settings or model selection.

Provider refresh helper pattern:

1. Load and normalize config.
2. Build models, form, logo, provider type, and display name.
3. Call `registerProvider(PROVIDER_ID, options)`.
4. Re-run after config/model/status changes.

## Settings UI Patterns

### Plugin settings tab

Use `registerSettings(component)` when the plugin needs its own settings tab in plugin details. Unregister it in `uninstall()` if the plugin has explicit cleanup.

Example source: `packages/qi-cli/example/agent-qi-openai-server-plugin`.

### Provider form extension

Use `registerHook('provider:form-fields', ...)` when adding fields to the app's existing provider settings page.

Example source: `packages/qi-cli/example/ollama-starter`.

### Rich plugin UI

Use `useForm`, `useTable`, `useModal`, TSX, and `context.vue.markRaw` for complex interfaces. Good examples:

- `civitai-plugin`
- `llama-cpp-plugin`
- `vosk-speech-recognition`
- `codex-proxy-plugin`

## Hook Names Seen In Source

- `provider:form-fields`
- `ai:before-use`
- `speech.stream.start`
- `speech.stream.data`
- `speech.stream.stop`
- `speech.recognize`
- `plugin.clearData`

Hook handlers should be idempotent. `plugin.clearData` is recommended for plugins that own files under `getPluginsDataPath()` or other cache locations.

## Build And Packaging

### Dev mode

- `qi code dev` runs `build:watch` when present, otherwise `dev`.
- Agent-Qi Development Mode loads the selected directory and watches for file changes.
- Desktop dev mode can load `dist/index.js`.

### Packaging

- `qi code build` searches upward for `info.json`.
- It requires a built `dist/` directory.
- It writes updated `version` and `updatedAt` into `info.json`.
- It zips `info.json` and the contents of `dist/` into the `.qi` root.
- `info.json.extraAssets` can add files or directories.
- Installed `.qi` packages must include root `index.js`.

### `info.json` Fields

Common fields:

- `name`
- `description`
- `version`
- `author`
- `updatedAt`
- `main`
- `platforms`
- `mobileUnsupportedReason`
- `extraAssets`

The desktop loader uses its own entry search; do not assume `main` overrides the loader's `index.js` expectations.

## Quick Checklist

- Does the built code make `plugin` available to `return plugin`?
- Does `dist/index.js` exist?
- Does the `.qi` contain root `index.js`?
- Does `info.json` carry accurate display metadata and platform metadata?
- Are provider ids, registry ids, hook names, tool names, and storage keys stable?
- Does config persist via `localforage` where users expect it?
- Does `uninstall()` clean up statuses, processes, timers, registries, providers, tools, and settings UI?
