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
- tools / hooks
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
  - `components`
  - `vue.ref/reactive/computed/watch/h/defineComponent/...`
- storage / app state
  - `localforage.getItem/setItem/removeItem`
  - `getStore('settings')`
  - `getRegisteredProviders()`
  - `getPluginsDataPath()`
- system
  - `api.fs`
  - `api.path`
  - `api.os`
  - `api.spawn`
- feedback
  - `notification.success/info/warning/error/loading/status/removeStatus`

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
