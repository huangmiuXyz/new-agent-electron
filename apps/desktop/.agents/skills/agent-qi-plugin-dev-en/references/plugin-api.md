# Plugin API Notes

## Core Interfaces

Reference source: `packages/types/src/plugin.ts`

### Plugin

- `name: string`
- `version?: string`
- `description?: string`
- `updatedAt?: string`
- `install(context): void | Promise<void>`
- `uninstall?(context): void | Promise<void>`

### Most Useful PluginContext APIs

- provider / registry
  - `registerProvider(providerId, options)`
  - `unregisterProvider(providerId)`
  - `registerRegistry(name, factory, options?)`
  - `unregisterRegistry(name)`
- tools / hooks / commands
  - `registerBuiltinTool(name, tool)`
  - `unregisterBuiltinTool(name)`
  - `registerHook(name, handler)`
  - `registerCommand(name, handler)`
- UI
  - `useForm()`
  - `useTable()`
  - `useModal()`
  - `useDownload()`
  - `useIcon()`
  - `useTerminal()`
  - `components`
  - `vue.ref/reactive/computed/watch/h/defineComponent/...`
- storage / app state
  - `localforage.getItem/setItem/removeItem`
  - `getStore('settings')`
  - `getRegisteredProviders()`
  - `getPluginsDataPath()`
- feedback
  - `notification.success/info/warning/error/loading/status/removeStatus`

## Real `context.api` Surface Area

Reference sources:

- `packages/types/src/electron.ts`
- `apps/desktop/src/preload/index.ts`

Do not reduce `context.api` to only `fs/path/os/spawn`. The plugin context exposes a much broader Electron preload API.

### Process And System

- `api.process`
  - `platform`
  - `env`
  - `execPath`
- `api.os`
- `api.exec`
- `api.spawn`
- `api.fork`
- `api.execFileCommand()`

Good for:

- starting local services
- reading environment variables
- launching external commands
- reliably executing a single binary

### Files And Paths

- `api.fs`
- `api.path`
- `api.watch(path, callback)`
- `api.getPath(name)`
- `api.getAppPath()`
- `api.getPluginsPath()`
- `api.getBundledRipgrepPath()`

Good for:

- reading and writing plugin files
- directory traversal
- file watching
- locating user data, plugin directories, and app paths

### Shell And Clipboard

- `api.shell`
- `api.clipboard.writeText()`
- `api.clipboard.readText()`
- `api.url`
- `api.mime`

Good for:

- opening external links or files
- copy/paste flows
- URL and MIME handling

### Dialog And App Capabilities

- `api.showOpenDialog()`
- `api.app`
- `api.openDevTools()`
- `api.isPackaged`

Good for:

- choosing files or directories
- detecting packaged versus dev environments
- reading Electron app metadata

### PTY And Terminal

- `api.pty.spawn()`
- `api.pty.write()`
- `api.pty.resize()`
- `api.pty.kill()`
- `api.pty.onData()`
- `api.pty.onExit()`

Good for:

- interactive terminal experiences
- long-running shell sessions

### Network And Download

- `api.net.fetch()`
- `api.net.download()`
- `api.net.onDownloadProgress()`
- `api.net.cancelDownload()`

Good for:

- requests that should go through main-process networking
- large file downloads with progress reporting

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

Good for:

- plugins participating in local knowledge or embedding/index workflows

### Search And Replace

- `api.searchReplace.execute(...)`

Good for:

- controlled file edits
- batch search/replace flows

### Sync Features

- `api.sync.startHost()`
- `api.sync.stopHost()`
- `api.sync.getHostState()`
- `api.sync.updateProfile()`
- `api.sync.publishSnapshot()`
- `api.sync.listEndpoints()`
- `api.sync.getEndpointSnapshot()`
- `api.sync.onEvent()`

Good for:

- device sync or LAN sync style plugins

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

Good for:

- desktop automation
- screenshots
- mouse and keyboard control

### Windows And Updater

- `api.setTitleBarTheme()`
- `api.createTempChat()`
- `api.getTempChatData()`
- `api.updater.getVersion()`
- `api.updater.checkForUpdates()`
- `api.updater.downloadUpdate()`
- `api.updater.quitAndInstall()`
- `api.updater.onStatus()`

Good for:

- window behavior
- temporary chat flows
- app update state

## Documentation Guidance

- If a plugin only needs standard file/process access, document `fs/path/os/spawn/execFileCommand/watch` first
- If a plugin needs downloads, PTY, automation, sync, or sqlite, call out the relevant `api.*` namespace explicitly
- Do not guess preload APIs; go back to `packages/types/src/electron.ts`

## Common Implementation Patterns

### 1. Minimal plugin

- Implement only `install()`
- Show a notification or register exactly one capability
- Good starting point for small features

### 2. Provider sync helper

Complex provider plugins often centralize provider refresh in one helper:

- build provider options from current runtime config
- call `registerProvider(PROVIDER_ID, options)`
- call it again after config, model, or status changes

This is a strong pattern in `llama-cpp-plugin`.

### 2.1 What `registerProvider()` really does

`registerProvider()` does not directly overwrite the built-in `providers` list in the settings store.

The real behavior is:

1. write a plugin-owned record into `registeredProviders`
2. let the UI merge `providers` and `registeredProviders` through `getAllProviders`
3. expose the merged result in settings and model selection flows

Implications:

- plugin providers are appended dynamically
- calling `registerProvider()` repeatedly to refresh form, models, name, or logo is expected
- unload removes those plugin-owned providers and clears some related default model references

### 2.2 What `registerRegistry()` really does

- `registerRegistry(name, factory)` adds a provider factory to the chat service registry
- provider type selectors are driven by the registry in `registry.ts`
- `{ hide: true }` allows a registry to exist without appearing in normal provider type pickers

### 3. Persisted local config

Typical flow:

1. Load from `localforage` inside `install()`
2. Normalize it
3. Save updates back to `localforage`
4. Re-sync the provider if behavior changes

### 4. settings store integration

Use `getStore('settings')` when the plugin must read or update the app's own settings.

Typical use cases:

- update provider settings in bulk
- align app defaults with plugin-managed providers
- inspect the list of existing providers

### 5. Long-running work and services

If the plugin starts local services, downloads files, or polls state:

- prevent duplicate starts
- expose progress with `notification.loading()` or `notification.status()`
- use timeout and retry
- clean up timers, providers, statuses, and tools in `uninstall()`

### 6. Hook-driven extension

Hook-based extension points visible in source and examples include:

- `provider:form-fields`
  - inject extra fields into the global provider settings form
  - example: `ollama-starter`
- `ai:before-use`
  - perform setup before a provider is actually used
  - examples: `ollama-starter`, `llama-cpp-plugin`, `codex-proxy-plugin`
- `plugin.clearData`
  - cooperate with the settings page's clear-cache action
  - example: `vosk-speech-recognition`

If the plugin owns local assets, models, or caches, implement `plugin.clearData`

## Build And Packaging

### Dev mode

- `qi code dev` looks for `build:watch` or `dev`
- Load the directory in Agent-Qi via `Settings -> Plugins -> Development Mode`

### Packaging

- `qi code build` searches upward for `info.json`
- It packages `dist/` plus `info.json`
- If `info.json.extraAssets` exists, those files/directories are added too

### Important files

- `info.json`
  - display name, version, author, update time, extra assets
- `package.json`
  - package name, scripts, dependencies
- `vite.config.ts`
  - should emit `dist/index.js`

## Quick Checklist

- Does the plugin `export default plugin`?
- Is `dist/` generated?
- Is `info.json.name` readable to users?
- Are provider ids, registry ids, and storage keys stable?
- Does `uninstall()` clean up?
- Are user-visible failures surfaced via `notification.error()`?
