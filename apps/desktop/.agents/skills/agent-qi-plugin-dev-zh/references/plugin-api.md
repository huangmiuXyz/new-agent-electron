# Plugin API Notes

实现插件代码或确认上下文 API 时读这个文件。优先参考源码：

- `packages/types/src/plugin.ts`
- `packages/types/src/electron.ts`
- `packages/types/src/components.ts`
- `apps/desktop/src/preload/index.ts`
- `apps/desktop/src/renderer/src/services/plugins/pluginManager.ts`

## 核心接口

### Plugin

- `name: string`
- `version?: string`
- `description?: string`
- `updatedAt?: string`
- `readme?: string`
- `install(context): void | Promise<void>`
- `uninstall?(context): void | Promise<void>`

### PluginContext 常用 API

- 生命周期与应用上下文
  - `app`、`pinia`、`router`、`basePath`
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
- 存储 / 应用状态
  - `localforage.getItem/setItem/removeItem`
  - `getStore('settings')`
  - `getPluginsDataPath()`
- 反馈
  - `notification.success/info/warning/error/loading/status/removeStatus`

## `execNodejs()`

插件需要在独立进程里运行自带 Node.js 代码时，优先用 `context.execNodejs()`。它比手写 shell 命令更适合插件本地脚本，因为 `PluginManager.createContext()` 会默认：

- 把 `cwd` 设为 `basePath`
- 把 `moduleBasePath` 设为 `basePath`
- 把 args 和 env 克隆为可序列化的普通数据

适合：

- 本地 HTTP 桥接服务
- 插件自带脚本
- 依赖插件本地 npm 依赖的任务

示例：`packages/qi-cli/example/agent-qi-openai-server-plugin`。

## `context.api` 能力范围

不要把 `context.api` 简化成只有 `fs/path/os/spawn`。使用前先查 `packages/types/src/electron.ts`。

### 进程与系统

- `api.process.platform/env/execPath`
- `api.os`
- `api.exec`
- `api.spawn`
- `api.fork`
- `api.execNodejs`
- `api.execFileCommand()`

适合本地服务、环境检查、外部命令和指定可执行文件调用。

### 文件与路径

- `api.fs`
- `api.path`
- `api.watch(path, callback)`
- `api.getPath(name)`
- `api.getAppPath()`
- `api.getPluginsPath()`
- `api.getBundledRipgrepPath()`

适合插件文件、目录遍历、监听、应用路径、用户数据路径和内置 ripgrep。

### Shell、剪贴板、URL、MIME

- `api.shell`
- `api.clipboard.writeText()`
- `api.clipboard.readText()`
- `api.url`
- `api.mime`

适合打开外部文件/链接、复制粘贴、URL 与 MIME 处理。

### 对话框与应用能力

- `api.showOpenDialog()`
- `api.app`
- `api.openDevTools()`
- `api.isPackaged`

适合原生选择对话框、打包态判断和 Electron app 元数据。

### PTY 与终端

- `api.pty.spawn()`
- `api.pty.write()`
- `api.pty.resize()`
- `api.pty.kill()`
- `api.pty.onData()`
- `api.pty.onExit()`

适合交互式终端体验和长时间 shell 会话。

### 网络与下载

- `api.net.fetch()`
- `api.net.download()`
- `api.net.onDownloadProgress()`
- `api.net.cancelDownload()`

适合主进程网络请求和带进度的大文件下载。

需要插件隔离的任务状态和 UI 友好进度时，优先用 `context.useDownload()`。

### SQLite 与本地索引

- `api.sqlite.isSupported()`
- `api.sqlite.upsertChunks()`
- `api.sqlite.updateChunks()`
- `api.sqlite.deleteChunksByDoc()`
- `api.sqlite.deleteChunksByKb()`
- `api.sqlite.getChunkCountsByDoc()`
- `api.sqlite.search()`
- `api.sqlite.getAllChunks()`
- `api.sqlite.getChunksByHash()`

适合知识库、embedding 或本地索引类插件。

### 应用补丁

- `api.applyPatch.execute(...)`

适合受控文件修改或 patch 型批量变更。

### 同步能力

- `api.sync.startHost()`
- `api.sync.stopHost()`
- `api.sync.getHostState()`
- `api.sync.updateProfile()`
- `api.sync.publishSnapshot()`
- `api.sync.listEndpoints()`
- `api.sync.getEndpointSnapshot()`
- `api.sync.onEvent()`

适合局域网或设备同步插件。

### 电脑控制

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

适合桌面自动化、截屏、鼠标键盘控制。

### 窗口与更新

- `api.setTitleBarTheme()`
- `api.createTempChat()`
- `api.getTempChatData()`
- `api.updater.getVersion()`
- `api.updater.checkForUpdates()`
- `api.updater.downloadUpdate()`
- `api.updater.quitAndInstall()`
- `api.updater.onStatus()`

适合窗口行为、临时聊天和应用更新状态。

## Provider 模式

### `registerRegistry()`

- 向聊天服务 registry 增加 provider factory。
- registry 名通常就是 `providerType`。
- `{ hide: true }` 可以让 factory 存在但不出现在 provider type 选择器里。
- 应用需要知道如何实例化 provider 实现时使用它。

### `registerProvider()`

- 向 `settings.registeredProviders` 写入插件拥有的 provider 记录。
- UI 通过 `getAllProviders` 合并内置 `providers` 与 `registeredProviders`。
- 重复调用会更新已有插件 provider 记录。
- 需要让 provider 出现在设置页或模型选择中时使用它。

Provider 刷新 helper 模式：

1. 加载并规范化配置。
2. 构建 models、form、logo、provider type 和展示名。
3. 调用 `registerProvider(PROVIDER_ID, options)`。
4. 配置、模型或状态变化后重新执行。

## 设置 UI 模式

### 插件设置标签

插件需要在插件详情页提供自己的设置标签时，用 `registerSettings(component)`。如果插件有显式清理逻辑，卸载时调用 `unregisterSettings()`。

示例：`packages/qi-cli/example/agent-qi-openai-server-plugin`。

### 扩展 provider 表单

要给应用已有 provider 设置页追加字段时，用 `registerHook('provider:form-fields', ...)`。

示例：`packages/qi-cli/example/ollama-starter`。

### 复杂插件 UI

复杂界面使用 `useForm`、`useTable`、`useModal`、TSX 和 `context.vue.markRaw`。可参考：

- `civitai-plugin`
- `llama-cpp-plugin`
- `vosk-speech-recognition`
- `codex-proxy-plugin`

## 源码中可见的 Hook 名

- `provider:form-fields`
- `ai:before-use`
- `speech.stream.start`
- `speech.stream.data`
- `speech.stream.stop`
- `speech.recognize`
- `plugin.clearData`

hook 处理函数应保持幂等。插件如果拥有 `getPluginsDataPath()` 下的文件或其他缓存，建议实现 `plugin.clearData`。

## 构建与打包

### 开发模式

- `qi code dev` 优先运行 `build:watch`，否则运行 `dev`。
- Agent-Qi 开发模式加载所选目录并监听文件变化。
- 桌面开发模式可以加载 `dist/index.js`。

### 打包

- `qi code build` 会向上查找 `info.json`。
- 它要求已经构建出 `dist/` 目录。
- 它会把更新后的 `version` 和 `updatedAt` 写回 `info.json`。
- 它把 `info.json` 和 `dist/` 内容压到 `.qi` 根目录。
- `info.json.extraAssets` 可以额外加入文件或目录。
- 安装后的 `.qi` 包必须包含根目录 `index.js`。

### `info.json` 字段

常见字段：

- `name`
- `description`
- `version`
- `author`
- `updatedAt`
- `main`
- `platforms`
- `mobileUnsupportedReason`
- `extraAssets`

桌面 loader 使用自己的入口查找逻辑；不要假设 `main` 能覆盖 loader 对 `index.js` 的预期。

## 快速清单

- 构建代码是否能让 `return plugin` 拿到对象？
- 是否存在 `dist/index.js`？
- `.qi` 中是否有根目录 `index.js`？
- `info.json` 是否包含准确的展示元数据和平台元数据？
- provider id、registry id、hook 名、tool 名、storage key 是否稳定？
- 用户期望保存的配置是否通过 `localforage` 持久化？
- `uninstall()` 是否清理状态位、进程、定时器、registries、providers、tools 和设置 UI？
