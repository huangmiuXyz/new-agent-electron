# Runtime Architecture

These notes come from the plugin loader, plugin manager, settings store, provider registry, and CLI commands. Treat them as source-backed constraints.

## 1. How Desktop Plugins Are Loaded

Key files:

- `apps/desktop/src/renderer/src/services/plugins/pluginLoader.ts`
- `apps/desktop/src/renderer/src/services/plugins/pluginManager.ts`

Desktop load flow:

1. resolve the plugin directory
2. search for `index.js`, `dist/index.js`, then `build/index.js`
3. fetch/read the JavaScript code as text
4. wrap it as `new Function('Vue', code + 'return plugin;')`
5. execute it and retrieve `plugin`
6. read metadata from `info.json` and README when available
7. create a context with `PluginManager.createContext()`
8. call `plugin.install(context)`

Implications:

- the built artifact must expose a variable named `plugin`
- IIFE output with Vite `lib.name = 'plugin'` is intentional
- `export default plugin` is fine only if the final bundle still exposes `plugin`
- `info.json.main` is metadata; do not depend on it for desktop loader entry resolution

## 2. Dev Mode Versus Installed Mode

### Dev mode

- loaded from a user-selected local directory
- plugin id is the directory basename
- the selected path is stored in `devPlugins`
- the directory is watched; changes trigger reload
- loader can find `dist/index.js`, so normal Vite build output works

### Installed mode

- `.qi` packages are extracted into the user plugins directory
- the package must include root `info.json` and root `index.js`
- `qi code build` achieves this by zipping the contents of `dist/` into the package root
- README and `extraAssets` may be included

## 3. Mobile Package Loading

The loader also supports mobile-stored plugin packages.

Important platform behavior:

- `info.json.platforms` controls whether a plugin is supported on `desktop` or `mobile`
- missing or empty `platforms` means supported everywhere
- `mobileUnsupportedReason` can explain why a desktop-only plugin is blocked on mobile
- mobile plugins cannot assume desktop preload APIs such as local filesystem, local process spawning, PTY, or native dialogs

When writing plugins that should work on mobile, keep runtime dependencies API/network-oriented and check the actual available API surface.

## 4. Metadata Ownership

After code is loaded, `pluginLoader` reads `info.json`:

- `plugin.name = info.name || pluginName`
- `version`, `description`, `author`, and `updatedAt` are copied from metadata when present
- README content can be attached to the plugin info for display

Consequences:

- code metadata is not the only source of truth
- display names should be maintained in `info.json`
- dev-mode identity can differ from display name
- inconsistent names can make reloads, settings display, and provider ownership confusing

## 5. Plugin Context Construction

`PluginManager.createContext()` injects:

- `window.api`
- `pinia`, `router`, and app
- `context.vue`
- `useForm`, `useTable`, `useDownload`, `useModal`, `useTerminal`, `useIcon`
- `registerSettings` and `unregisterSettings`
- plugin-scoped `localforage`
- `execNodejs()` with plugin-local defaults
- store access through `getStore()`
- notification helpers

Useful detail:

- `getPluginsDataPath()` returns a plugin-specific data directory under user data on desktop
- use it for models, downloads, cache, and clearable plugin assets

## 6. Provider Visibility

Key files:

- `apps/desktop/src/renderer/src/services/plugins/pluginManager.ts`
- `apps/desktop/src/renderer/src/stores/settings.ts`
- `apps/desktop/src/renderer/src/pages/settings/provider.vue`

Flow:

1. plugin calls `registerProvider(providerId, options)`
2. `PluginManager` writes or updates a record in `registeredProviders`
3. `settings.ts` merges built-in `providers` and `registeredProviders` via `getAllProviders`
4. settings pages and model selection use the merged list

Therefore:

- plugin providers are dynamic provider records, not direct edits to the built-in provider list
- provider records carry `pluginName`
- repeated registration refreshes a plugin-owned provider
- unload can remove plugin-owned providers and clear related default model references

## 7. Registry And Provider Type

Key file:

- `apps/desktop/src/renderer/src/services/chatService/registry.ts`

`registerRegistry(name, factory, options?)`:

- registers a provider factory by type/name
- lets chat services instantiate that provider type
- can be hidden with `{ hide: true }`

General rule:

- `registerRegistry()` defines "how to construct it"
- `registerProvider()` defines "where users see/select it"

Complex provider plugins often need both.

## 8. Cleanup Responsibilities

`PluginManager.unregisterPlugin()` automatically removes plugin-owned:

- commands
- hooks
- built-in tools
- registry bookkeeping
- registered providers and some default model references
- registered plugin settings forms

`uninstall()` should still clean up resources the framework cannot fully know about:

- persistent `notification.status()` entries
- timers, watchers, polling loops, subscriptions
- child processes and local servers
- terminal sessions, recognizers, model instances
- download tasks and temporary files
- any runtime singleton owned by the plugin

Do explicit cleanup for non-trivial plugins.

## 9. CLI Behavior That Matters

Key files:

- `packages/qi-cli/src/commands/init.ts`
- `packages/qi-cli/src/commands/dev.ts`
- `packages/qi-cli/src/commands/build.ts`

Rules:

- generated templates use Vite library mode with IIFE output and `entryFileNames: 'index.js'`
- `qi code init <name> -t <template> -d "<description>" -a "<author>" -v "<version>" -y` creates a plugin project without prompts
- `qi code init -y` still needs the positional plugin package name
- `qi code dev` requires `package.json` and runs `build:watch` or `dev`
- `qi code build` searches upward for `info.json`
- build requires `dist/`
- `qi code build -y` skips the interactive version prompt
- build updates `info.json.updatedAt`, optionally version, and writes the `.qi`
- `extraAssets` entries are copied into the package when present

## 10. Practical Failure Modes

- bundle does not expose `plugin`: loader throws before install
- package has `dist/index.js` instead of root `index.js`: installed plugin fails
- dev directory basename and `info.json.name` drift unexpectedly: confusing reload/provider ownership
- provider registered without matching registry: UI shows provider but chat cannot instantiate it
- registry registered without provider: provider type exists but no provider appears in settings
- status indicator created but never removed: stale UI after unload
- local process started without cleanup: orphaned service
- desktop-only plugin marked mobile-compatible: mobile load fails or has missing API errors
