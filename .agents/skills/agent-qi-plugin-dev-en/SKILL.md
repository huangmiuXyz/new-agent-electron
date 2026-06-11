---
name: agent-qi-plugin-dev-en
description: English skill for Agent-Qi / agent-qi-electron plugin development. Use when creating, modifying, debugging, refactoring, documenting, validating, or packaging plugins for this app, especially work involving `info.json`, `src/index.ts(x)`, Vite IIFE output, provider or registry registration, settings forms, plugin settings tabs, built-in tools, hooks, status notifications, `execNodejs`, local persistence, downloads, modal/table UI, desktop/mobile platform metadata, or reuse of examples under `packages/qi-cli/example/*`.
---

# Agent-Qi Plugin Development

Implement plugins by starting from the repository's `qi code init` templates, then modifying the generated plugin to match the task. Prefer the CLI workflow, local examples, `@agent-qi/types`, and runtime internals over generic Electron, Vue, or Vite advice.

## Start With The CLI

For a new plugin, do not hand-write the project from scratch. Initialize it first with a fully parameterized command:

```bash
qi code init my-plugin -t hello-world -d "My plugin description" -a "Author Name" -v "1.0.0" -y
```

Use `qi code init --list-templates` to inspect template names. Choose the closest template with `-t`; if unsure, use `hello-world` only for tiny plugins and prefer real example templates for provider, UI, TTS, local-service, or tool plugins.

After initialization:

1. `cd my-plugin`
2. install dependencies with the repo's package manager
3. implement the requested behavior inside the generated structure
4. run `qi code dev` for development mode or build with the package scripts
5. run `qi code build -y` when packaging a distributable `.qi`

## Runtime Facts To Respect

Plugins are not loaded through normal ESM dynamic import. `pluginLoader.ts` reads built JavaScript as text and evaluates it with `new Function('Vue', code + 'return plugin;')`.

Hard constraints:

- the built artifact must expose a variable named `plugin`
- desktop dev mode searches `index.js`, `dist/index.js`, then `build/index.js`
- installed `.qi` packages must contain root `info.json` and root `index.js`
- example `vite.config.ts` files intentionally emit an IIFE named `plugin` with `entryFileNames: 'index.js'`
- arbitrary ESM-only or named-export-only output can fail before `install()` runs

Metadata constraints:

- in dev mode, the plugin id is the selected directory basename
- after loading, `info.json` can overwrite `plugin.name`, `version`, `description`, `author`, and `updatedAt`
- `README.md` is user-visible in plugin details when present
- keep directory name, `package.json.name`, `plugin.name`, and `info.json.name` intentionally aligned or intentionally different
- use `info.json.platforms` and `mobileUnsupportedReason` when a plugin depends on desktop-only APIs

## Work Order

1. Classify the plugin and choose a `qi code init -t ...` template.
   - Minimal starter: only `install()`.
   - Provider plugin: `registerRegistry()` and/or `registerProvider()`.
   - Settings or rich UI plugin: `useForm()`, `useTable()`, `useModal()`, `registerSettings()`, TSX, or `context.vue`.
   - Built-in tool plugin: `registerBuiltinTool()`.
   - Hook or automation plugin: `registerHook()`.
   - Runtime service plugin: `execNodejs()`, `context.api.spawn`, downloads, polling, status indicators, persisted config, and cleanup.

2. Initialize or locate the plugin project.
   - New plugin: use `qi code init <plugin-name> -t <template> -d "<description>" -a "<author>" -v "<version>" -y`.
   - Existing plugin: inspect its `info.json`, `package.json`, `src/index.ts(x)`, and `vite.config.ts` before editing.

3. Read the real source before editing generated code.
   - `packages/types/src/plugin.ts`
   - `packages/types/src/electron.ts` when using `context.api` or `execNodejs`
   - the closest example plugin under `packages/qi-cli/example/*`
   - `packages/qi-cli/src/commands/init.ts`, `dev.ts`, and `build.ts` when scaffolding, dev mode, or packaging behavior matters
   - runtime files only when behavior is ambiguous:
     - `apps/desktop/src/renderer/src/services/plugins/pluginLoader.ts`
     - `apps/desktop/src/renderer/src/services/plugins/pluginManager.ts`
     - `apps/desktop/src/renderer/src/stores/settings.ts`
     - `apps/desktop/src/renderer/src/services/chatService/registry.ts`

4. Keep the generated or nearest local pattern first.
   - Keep the example directory shape, state flow, Vite config, and UI composition style unless the repository clearly needs a different shape.
   - Do not design a new plugin architecture for a one-plugin request.

5. Validate the workflow the user will actually use.
   - Build `dist`.
   - Package `.qi` if distribution is part of the task.
   - For dev-mode work, ensure `package.json` has `build:watch` or `dev`.
   - Check that `uninstall()` cleans up owned side effects.

## Implementation Rules

### Entry Point And Build Output

- The entry file is usually `src/index.ts` or `src/index.tsx`.
- Prefer `const plugin: Plugin = { ... }` and `export default plugin`.
- Keep the Vite library name as `plugin` and output `dist/index.js`.
- `qi code build` packages the contents of `dist/` into the `.qi` root, so `dist/index.js` becomes package root `index.js`.
- Do not rely on `info.json.main` to rescue a nonstandard desktop entry path.

### Metadata

- `info.json.name` is the display/install metadata and can overwrite code metadata.
- In dev mode, the directory basename is the stable plugin id used for loading and watching.
- Use stable provider ids, registry ids, hook names, tool names, and storage keys.
- If the plugin uses desktop-only APIs, set `platforms: ["desktop"]` and a helpful `mobileUnsupportedReason`.
- If a plugin is mobile-compatible, avoid `window.api.fs`, local processes, desktop paths, PTY, native dialogs, and desktop-only bridge services.

### Provider Plugins

- Lightweight provider: often only `registerRegistry()`; see `moonshot-plugin`.
- Full provider: build config/form/runtime state, then call `registerProvider(PROVIDER_ID, { name, providerType, form, models, logo })`.
- For config changes that affect models, form, logo, status, or behavior, centralize refresh in a `syncProvider(context)` helper.
- `registerRegistry()` defines how chat services construct a provider type.
- `registerProvider()` makes a plugin-owned provider visible in settings and model selection.
- Repeated `registerProvider()` calls are acceptable for refreshing provider-visible data.

### Settings, Forms, And Rich UI

- Prefer `useForm()`, `useTable()`, `useModal()`, `useDownload()`, `useTerminal()`, and `useIcon()` over ad hoc UI.
- Use `registerSettings(component)` for a plugin settings tab in the plugin details page.
- Use `registerHook('provider:form-fields', ...)` only when extending an existing provider settings form.
- Use `context.vue.ref/reactive/computed/watch/defineComponent/h/markRaw` for reactive plugin UI.
- TSX/JSX is already used in examples and is appropriate for richer plugin settings.

### Tools, Hooks, And Commands

- Built-in tools use `registerBuiltinTool(name, tool)` and should provide clear `title`, `description`, `inputSchema`, and readable `toolResult.content`.
- Hooks should be idempotent and guarded against repeated side effects.
- Known hook names include `provider:form-fields`, `ai:before-use`, `speech.stream.start`, `speech.stream.data`, `speech.stream.stop`, `speech.recognize`, and `plugin.clearData`.
- If a plugin owns files, models, or cache, implement `plugin.clearData` so the settings page can clear real data.

### Processes, Downloads, And Background Work

- Prefer `execNodejs()` for plugin-bundled Node.js scripts because it defaults `cwd` and module resolution to the plugin directory.
- Use `context.api.spawn`, `exec`, `fork`, or `execFileCommand()` for external binaries.
- Use `context.useDownload()` or `context.api.net.download()` for large files and progress.
- Use `notification.loading()` for temporary work and `notification.status(id, text, options)` for persistent status indicators.
- Always plan re-entry protection, timeout, cancellation, and uninstall cleanup for processes, timers, downloads, watchers, and polling.

### Persistence And App State

- Use plugin-scoped `localforage` for restorable plugin config.
- Use `getStore('settings')` only when the plugin must read or update actual app settings.
- Use `getPluginsDataPath()` for model files, downloads, caches, and clearable plugin assets.
- Keep transient runtime values in memory; persist only values users expect to survive reloads.

### Uninstall

Non-trivial plugins should implement `uninstall(context)` and explicitly clean up:

- providers and registries when not fully handled by framework cleanup
- built-in tools if manually managed
- persistent `notification.status()` entries via `removeStatus()`
- timers, watchers, polling, and subscriptions
- child processes and server handles
- recognizers, model instances, terminals, downloads, and runtime singletons

## Validation Checklist

- Is the built output compatible with `return plugin`?
- Does `dist/index.js` exist after build?
- Does the `.qi` package contain root `info.json` and root `index.js`?
- Is `info.json.name` readable to users?
- Are platform fields correct for desktop/mobile behavior?
- Are provider ids, registry ids, hook names, tool names, and storage keys stable?
- Does config reload from `localforage` and re-sync providers when needed?
- Does `uninstall()` remove statuses, timers, processes, providers, registries, tools, and other owned side effects?
- Are user-visible failures surfaced through `notification.error()` or a status indicator?

## Read More Only When Needed

- Plugin API and common context usage: `references/plugin-api.md`
- Which example plugin to copy from for a given task: `references/example-map.md`
- Runtime mechanics and source-backed constraints: `references/runtime-architecture.md`
