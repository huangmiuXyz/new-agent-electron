---
name: agent-qi-plugin-dev-en
description: English skill for Agent-Qi / agent-qi-electron plugin development. Use when creating, modifying, debugging, refactoring, or packaging plugins for this app, especially for work involving `info.json`, `src/index.ts(x)`, provider registration, settings forms, built-in tools, status notifications, local persistence, download/modal UI, or reuse of examples under `packages/qi-cli/example/*`.
---

# Agent-Qi Plugin Development

Implement plugins the way this repository actually does it. Prefer existing examples, `@agent-qi/types`, the plugin runtime internals, and the `qi code` workflow over generic Electron, Vue, or Vite advice.

## Understand The Runtime First

In this repository, plugins are not loaded through a normal ESM dynamic import path. `pluginLoader.ts` reads built output as text and evaluates it with `new Function(... return plugin)`.

That creates a few hard constraints:

- the built artifact must expose a variable named `plugin`
- the runtime looks for `index.js`
- example `vite.config.ts` files commonly set the library name to `plugin` and emit an IIFE into `dist/index.js`
- if you switch to an arbitrary export pattern, the runtime may fail before `install()` is ever called

Metadata is also not controlled purely by code:

- installed plugins have `name/version/description/author/updatedAt` overwritten from `info.json`
- dev-mode plugin identity comes from the directory basename
- the visible name can still come from `info.json.name`
- do not let directory name, `package.json.name`, `plugin.name`, and `info.json.name` drift casually

## How To Work

1. Classify the plugin first.
   - Minimal / hello world: only `install()`, usually start from the hello-world shape.
   - Provider plugin: needs `registerRegistry()` and/or `registerProvider()`, see `moonshot-plugin`, `minimax-plugin`, `llama-cpp-plugin`.
   - Settings-heavy or UI-heavy plugin: needs `useForm()`, `useTable()`, `useModal()`, `context.vue`, see `civitai-plugin`, `vosk-speech-recognition`, `codex-proxy-plugin`.
   - Tool plugin: needs `registerBuiltinTool()`, see `smart-api-key-filler`.
   - Runtime service plugin: needs `context.api.spawn`, polling, status notifications, persisted config, see `ollama-starter`, `llama-cpp-plugin`.

2. Read these files before changing code.
   - [`packages/types/src/plugin.ts`](e:\code\private\agent-qi-electron\packages\types\src\plugin.ts)
   - The closest example plugin directory
   - Only read `packages/qi-cli/src/commands/init.ts`, `dev.ts`, and `build.ts` when scaffolding or packaging behavior matters

3. Match the nearest example before inventing structure.
   - Do not create a brand-new plugin architecture unless the repository clearly needs one.
   - Reuse the existing directory shape, state flow, and UI composition style whenever possible.

4. Read the runtime destination as well.
   - `apps/desktop/src/renderer/src/services/plugins/pluginLoader.ts`
   - `apps/desktop/src/renderer/src/services/plugins/pluginManager.ts`
   - `apps/desktop/src/renderer/src/stores/settings.ts`
   - `apps/desktop/src/renderer/src/services/chatService/registry.ts`
   - These files define what plugin APIs actually do in the app

## Default Workflow

1. Decide the output shape.
   - Registering a provider only
   - Adding a built-in tool only
   - Building a settings form or a table/modal UI
   - Managing long-lived local services, downloads, accounts, or model state

2. Establish the minimum skeleton.
   - Export `default plugin`
   - Keep `plugin.name` stable as the plugin identifier
   - Do not confuse display metadata in `info.json` with the package name in `package.json`

3. Wire into Agent-Qi APIs.
   - Provider APIs: `registerRegistry()`, `registerProvider()`, `unregisterProvider()`
   - Tool APIs: `registerBuiltinTool()`, `unregisterBuiltinTool()`
   - Hook APIs: `registerHook()`
   - UI APIs: `useForm()`, `useTable()`, `useModal()`, `useDownload()`, `useIcon()`
   - Persistence APIs: `localforage`, `getStore('settings')`
   - System APIs: `context.api` for `fs/path/os/spawn`
   - Feedback APIs: `notification.success/error/info/warning/loading/status`

4. Keep one clear source of truth for configuration.
   - In-memory state for transient runtime values
   - `localforage` for restorable plugin config
   - `settings` store only when the plugin must update real app settings
   - Re-register providers after config changes when provider-visible behavior changes

5. Validate the real workflow.
   - Build `dist`
   - Package `.qi`
   - If it is a dev-mode plugin, ensure `build:watch` or `dev` exists
   - Verify `uninstall()` cleans up provider, registry, status, tool, timers, and side effects

## Implementation Rules

### Entry Point And Metadata

- The entry file is usually `src/index.ts` or `src/index.tsx`
- Export `const plugin: Plugin = { ... }` and `export default plugin`
- `install(context)` is the main entry point
- If the plugin registers providers, tools, statuses, timers, or processes, it should usually implement `uninstall(context)`

### Provider Plugins

- Lightweight provider:
  - Only `registerRegistry()` to expose a provider factory
  - Example: `moonshot-plugin`
- Full provider:
  - Build runtime config and optional form first
  - Then call `registerProvider(PROVIDER_ID, { name, providerType, form, models, logo })`
  - Examples: `llama-cpp-plugin`, `civitai-plugin`
- If config changes affect models, logo, form, or behavior, centralize the refresh in a `syncProvider(context)` helper
- Understand the real `registerProvider()` semantics:
  - it writes into the settings store's `registeredProviders`
  - the UI merges `providers + registeredProviders` through `getAllProviders`
  - plugin providers are therefore appended dynamically rather than directly mutating the built-in provider list
- On unload, `PluginManager.unregisterPlugin()` attempts to remove that plugin's registered providers and clear default model references

### Settings Forms And Rich UI

- Prefer `useForm()`, `useTable()`, and `useModal()` instead of ad hoc UI patterns
- Use `context.vue.ref/reactive/computed/watch` for reactive state
- TSX/JSX is already used in examples and is appropriate for richer plugin UIs
- If you want to extend the existing provider settings page instead of registering a whole new provider, use hooks such as `registerHook('provider:form-fields', ...)`
  - `pages/settings/provider.vue` collects these fields and injects them into the provider form

### Built-In Tool Plugins

- Register tools with `registerBuiltinTool()`
- Provide a clear `title`, `description`, and `inputSchema`
- Return readable `toolResult.content`
- Example: `smart-api-key-filler`

### Hooks And Automation

- Use `registerHook()` for pre-flight checks or lifecycle-driven behavior
- Example: `ollama-starter` uses `ai:before-use` to auto-start a service
- Make hooks idempotent and guard against repeated side effects
- Hook usage visible in this repository includes:
  - `provider:form-fields`
  - `ai:before-use`
  - `speech.stream.start`
  - `speech.stream.data`
  - `speech.stream.stop`
  - `speech.recognize`
  - `plugin.clearData`
- If the plugin owns files or cache, implementing `plugin.clearData` is strongly recommended so the settings page can really clear plugin data

### Status Notifications And Background Work

- For long-running work, prefer `notification.loading()` or `notification.status()` over silent logs
- For polling, timers, downloads, or child processes, always handle:
  - re-entry protection
  - timeout
  - cancellation
  - uninstall cleanup
- See `llama-cpp-plugin` and `vosk-speech-recognition`
- `notification.status(id, text, options)` is suitable for persistent status indicators; remove it on uninstall
- `context.useDownload()` is plugin-scoped and is a good fit for model or asset downloads
- `context.getPluginsDataPath()` gives the plugin a dedicated data directory for downloadable or clearable assets

## Repository-Specific Conventions

### About Vite Output

- Keep the example plugin `vite.config.ts` shape unless there is a strong reason not to
- Core goals:
  - emit into `dist/`
  - produce `index.js`
  - expose `plugin` as the library/global name
  - stay compatible with `pluginLoader`

### About Metadata

- `info.json.name` behaves like the display/install name
- in dev mode, the directory basename becomes the plugin id
- `plugin.name` in code should still consistently represent the plugin identity
- inconsistent naming makes restore, dev reload, and settings display more fragile

### About Uninstall

Do not stop at `install()`. Always ask what must be cleaned up:

- `registerProvider()`
- `registerRegistry()`
- `registerBuiltinTool()`
- `notification.status()`
- timers and polling
- child processes
- download state
- runtime singletons

Non-trivial plugins should explicitly clean these up in `uninstall()` rather than relying only on framework cleanup

## File And Build Conventions

- A minimal plugin usually has:
  - `package.json`
  - `info.json`
  - `src/index.ts` or `src/index.tsx`
  - `vite.config.ts`
  - generated `dist/`
- `qi code build` packages `info.json` and `dist/` into a `.qi`
- `info.json.extraAssets` can include extra files or directories
- `qi code dev` expects `build:watch` or `dev` in `package.json`

## Do And Do Not

Do:

- Start from the closest example
- Use `@agent-qi/types`
- Keep provider ids, registry ids, and storage keys stable
- Extract helpers such as `normalizeConfig`, `syncProvider`, and `saveConfig` for non-trivial plugins
- Surface real errors with `notification.error()`

Do not:

- Reduce the skill to basic `qi cli` usage
- Assume this plugin API is the same as a generic Electron or Vue plugin API
- Keep all state in globals without persistence when users expect config to survive reloads
- Forget to clean up registered providers, tools, hooks, statuses, timers, or processes
- Ignore repository examples and reinvent provider/form synchronization

## Read More Only When Needed

- Plugin API and common context usage: `references/plugin-api.md`
- Which example plugin to copy from for a given task: `references/example-map.md`
- Runtime mechanics and source-backed constraints: `references/runtime-architecture.md`
