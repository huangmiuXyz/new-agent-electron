# Runtime Architecture

These notes come from the plugin loader, plugin manager, settings store, and provider registry implementation. Treat them as hard constraints.

## 1. How plugins are loaded

Key files:

- `apps/desktop/src/renderer/src/services/plugins/pluginLoader.ts`
- `apps/desktop/src/renderer/src/services/plugins/pluginManager.ts`

Desktop loading flow, roughly:

1. find `index.js`, `dist/index.js`, or `build/index.js`
2. read the built code as text
3. wrap it with `new Function('Vue', code + 'return plugin;')`
4. execute it and retrieve `plugin`
5. create a context with `PluginManager.createContext()` and call `plugin.install(context)`

So you should assume:

- the artifact must expose a variable named `plugin`
- the entry filename should usually stay `index.js`
- the example Vite configs using IIFE output and `lib.name = 'plugin'` are intentional

## 2. Who owns metadata

After code is loaded, `pluginLoader` reads `info.json` and `README.md`:

- `info.json` can overwrite `plugin.name`
- it also overwrites `version/description/author/updatedAt`
- `README.md` is shown in the plugin details page

Implications:

- code metadata is not the only source of truth
- keep `info.json` accurate
- README is user-visible and worth maintaining

## 3. Dev mode versus installed mode

### Dev mode

- loaded from a local directory via Development Mode
- plugin id comes from the directory basename
- loader stores the local path and watches for file changes
- changes trigger plugin reload

### Installed mode

- `.qi` packages are extracted into the user plugin directory
- the package must include `info.json` and `index.js`
- README and extra assets may also be included

## 4. How plugin context is built

`PluginManager.createContext()` injects:

- `window.api`
- `pinia/router/app`
- `context.vue`
- `useForm/useTable/useDownload/useModal/useTerminal/useIcon`
- a plugin-scoped `localforage` instance named after the plugin
- access to settings / chats / notes / knowledge / agent stores

One especially useful detail:

- `getPluginsDataPath()` returns a plugin-specific data directory
- use it for models, downloads, and clearable assets

## 5. How providers actually enter the UI

Key files:

- `pluginManager.ts`
- `stores/settings.ts`
- `pages/settings/provider.vue`

Real flow:

1. plugin calls `registerProvider(providerId, options)`
2. `PluginManager` writes a record into `registeredProviders`
3. `settings.ts` merges `providers` and `registeredProviders` via `getAllProviders`
4. settings and chat selection use that merged list

Therefore:

- plugin providers are not directly written into the default provider list
- they are dynamic providers carrying `pluginName`
- unload can remove them by `pluginName`

## 6. Registry and providerType

Key file:

- `apps/desktop/src/renderer/src/services/chatService/registry.ts`

`registerRegistry(name, factory)` means:

- add a provider factory to the provider registry
- make the chat service able to instantiate that provider type
- if the registry is not hidden, it can appear in provider type selectors

General rule:

- `registerRegistry()` defines how to construct a provider
- `registerProvider()` makes that provider visible in UI/settings

Complex plugins often use both.

## 7. What the framework cleans up, and what it does not

`PluginManager.unregisterPlugin()` automatically removes:

- commands registered by the plugin
- hooks
- built-in tools
- registry bookkeeping
- registered providers and some default model references

But `uninstall()` should still clean up:

- persistent status indicators created with `notification.status()`
- timers and polling
- child processes
- recognizers, models, or other runtime singletons
- anything else the plugin owns directly

Do not assume framework cleanup is enough for complex plugins.
