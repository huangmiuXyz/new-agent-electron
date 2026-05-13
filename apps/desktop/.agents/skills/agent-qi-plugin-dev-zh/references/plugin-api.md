# Plugin API Notes

## 核心接口

参考源：`packages/types/src/plugin.ts`

### Plugin

- `name: string`
- `version?: string`
- `description?: string`
- `updatedAt?: string`
- `install(context): void | Promise<void>`
- `uninstall?(context): void | Promise<void>`

### PluginContext 中最常用的能力

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

## `context.api` 真实能力范围

参考源：

- `packages/types/src/electron.ts`
- `apps/desktop/src/preload/index.ts`

不要把 `context.api` 简化成只有 `fs/path/os/spawn`。插件上下文里暴露的是一整套 Electron preload API。

### 进程与系统信息

- `api.process`
  - `platform`
  - `env`
  - `execPath`
- `api.os`
- `api.exec`
- `api.spawn`
- `api.fork`
- `api.execFileCommand()`

适合：

- 启动本地服务
- 读取环境变量
- 调用外部命令
- 比 `exec` 更稳地执行单个可执行文件

### 文件与路径

- `api.fs`
- `api.path`
- `api.watch(path, callback)`
- `api.getPath(name)`
- `api.getAppPath()`
- `api.getPluginsPath()`
- `api.getBundledRipgrepPath()`

适合：

- 读写插件文件
- 遍历目录
- 文件变化监听
- 找到用户数据目录、插件目录、应用目录

### Shell 与剪贴板

- `api.shell`
- `api.clipboard.writeText()`
- `api.clipboard.readText()`
- `api.url`
- `api.mime`

适合：

- 打开外部链接或文件
- 复制文本
- MIME / URL 处理

### 对话框与应用能力

- `api.showOpenDialog()`
- `api.app`
- `api.openDevTools()`
- `api.isPackaged`

适合：

- 选择文件或目录
- 判断开发态 / 打包态
- 访问 Electron app 信息

### 终端与伪终端

- `api.pty.spawn()`
- `api.pty.write()`
- `api.pty.resize()`
- `api.pty.kill()`
- `api.pty.onData()`
- `api.pty.onExit()`

适合：

- 构建带交互的终端体验
- 长时间运行 shell 会话

### 网络与下载

- `api.net.fetch()`
- `api.net.download()`
- `api.net.onDownloadProgress()`
- `api.net.cancelDownload()`

适合：

- 需要主进程网络能力的请求
- 下载大文件并拿到进度

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

适合：

- 插件直接参与本地知识库 / 向量索引流程

### 应用补丁

- `api.applyPatch.execute(...)`

适合：

- 受控的文件级修改
- 批量搜索替换任务

### 同步能力

- `api.sync.startHost()`
- `api.sync.stopHost()`
- `api.sync.getHostState()`
- `api.sync.updateProfile()`
- `api.sync.publishSnapshot()`
- `api.sync.listEndpoints()`
- `api.sync.getEndpointSnapshot()`
- `api.sync.onEvent()`

适合：

- 设备间同步或局域网同步相关插件

### 电脑控制能力

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

适合：

- 桌面自动化
- 截屏
- 鼠标键盘控制

### 窗口与更新

- `api.setTitleBarTheme()`
- `api.createTempChat()`
- `api.getTempChatData()`
- `api.updater.getVersion()`
- `api.updater.checkForUpdates()`
- `api.updater.downloadUpdate()`
- `api.updater.quitAndInstall()`
- `api.updater.onStatus()`

适合：

- 和窗口行为、临时聊天、更新状态有关的插件能力

## 写技能时的建议

- 如果插件只需要普通文件与进程能力，文档中优先写 `fs/path/os/spawn/execFileCommand/watch`
- 如果插件需要下载、终端、桌面自动化、同步、sqlite 等高级能力，要明确点名对应 `api.*` 子域
- 不要臆测 preload API，优先回到 `packages/types/src/electron.ts` 看定义

## 常见实现模式

### 1. 最小插件

- 只需要 `install()`
- 可以只弹通知，或只注册一项能力
- 适合从 `qi code init` 的 hello-world 起步

### 2. Provider 同步函数

复杂 provider 插件常见一个集中函数：

- 从当前运行态配置构造 provider 选项
- 调用 `registerProvider(PROVIDER_ID, options)`
- 在配置变化、模型变化、状态变化后重复调用

这个模式在 `llama-cpp-plugin` 很典型。

### 2.1 registerProvider 的真实效果

`registerProvider()` 并不是直接覆盖 settings store 中的内置 `providers` 列表。

真实行为是：

1. 向 `registeredProviders` 写入一条带 `pluginName` 的记录
2. 设置页通过 `getAllProviders` 把 `providers` 与 `registeredProviders` 合并
3. provider 表单和模型选择最终看到的是合并后的结果

这意味着：

- 插件 provider 是“附加注册”的
- 如果你要刷新插件 provider 的表单、模型、名称、logo，重复调用 `registerProvider()` 是合理的
- 卸载时框架会尝试移除这些附加 provider，并清理默认模型引用

### 2.2 registerRegistry 的真实效果

- `registerRegistry(name, factory)` 会把 provider factory 注册进 chat service registry
- UI 中 providerType 下拉来自 `registry.ts` 中的 provider factory 列表
- 如果注册时传 `{ hide: true }`，该 registry 可被程序使用但不出现在普通 provider type 列表里

### 3. 本地配置持久化

常见步骤：

1. 在 `install()` 里从 `localforage` 读配置
2. 做 normalize
3. 用户改表单后写回 `localforage`
4. 若 provider 输出受影响，重新同步 provider

### 4. settings store 联动

如果插件要修改应用的 provider 配置或默认模型，读取 `getStore('settings')`。

适合：

- 批量修改 provider 配置
- 根据当前 provider 状态更新应用设置
- 读取应用已有 provider 列表

### 5. 长任务与后台服务

如果插件会启动本地服务、下载文件或轮询状态：

- 用状态变量避免重复启动
- 给用户展示 `notification.loading()` 或 `notification.status()`
- 用超时和重试
- 在 `uninstall()` 里清理 timer、provider、status、tool

### 6. Hook 驱动扩展

从源码和示例可以确认的 hook 扩展方式：

- `provider:form-fields`
  - 让插件给全局 provider 设置页追加表单字段
  - 示例：`ollama-starter`
- `ai:before-use`
  - 在模型真正调用前做准备动作
  - 示例：`ollama-starter`、`llama-cpp-plugin`、`codex-proxy-plugin`
- `plugin.clearData`
  - 配合设置页的清缓存动作，删除插件文件和本地状态
  - 示例：`vosk-speech-recognition`

如果插件有插件级资源目录、模型文件或大缓存，建议实现 `plugin.clearData`

## 打包与开发

### 开发态

- `qi code dev` 会寻找 `build:watch` 或 `dev` 脚本
- 在 Agent-Qi 中通过 `Settings -> Plugins -> Development Mode` 加载目录

### 打包

- `qi code build` 从当前插件目录向上查找 `info.json`
- 打包 `dist/` 和 `info.json`
- 若 `info.json.extraAssets` 存在，也会把这些文件一起打包

### 重要文件

- `info.json`
  - 展示名、版本、作者、更新时间、附加资源
- `package.json`
  - 包名、脚本、依赖
- `vite.config.ts`
  - 需确保输出到 `dist/index.js`

## 实用检查清单

- 插件是否 `export default plugin`
- `dist/` 是否已生成
- `info.json.name` 是否可读
- provider id / registry id / storage key 是否稳定
- `uninstall()` 是否做清理
- 错误是否通过 `notification.error()` 暴露给用户
