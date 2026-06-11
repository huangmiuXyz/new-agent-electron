---
name: agent-qi-plugin-dev-zh
description: 面向 Agent-Qi / agent-qi-electron 的中文插件开发技能。用于创建、修改、调试、重构、记录、验证或打包本应用插件时触发，尤其适合处理 `info.json`、`src/index.ts(x)`、Vite IIFE 产物、provider/registry 注册、设置表单、插件设置页、内置工具、hooks、状态通知、`execNodejs`、本地持久化、下载、模态框/表格 UI、桌面/移动端平台元数据，以及复用 `packages/qi-cli/example/*` 示例插件。
---

# Agent-Qi 插件开发

开发插件时先用仓库自带的 `qi code init` 模板初始化，再在生成的插件结构里实现需求。优先相信 CLI 工作流、本地示例、`@agent-qi/types` 和运行时实现，不套用泛泛的 Electron、Vue 或 Vite 插件经验。

## 先用 CLI 初始化

新建插件时，不要从零手写项目。先用完整带参数命令初始化：

```bash
qi code init my-plugin -t hello-world -d "插件描述" -a "作者" -v "1.0.0" -y
```

用 `qi code init --list-templates` 查看模板名。通过 `-t` 选择最接近的模板；只有很小的插件才用 `hello-world`，provider、UI、TTS、本地服务、工具类插件优先使用真实示例模板。

初始化后：

1. `cd my-plugin`
2. 用仓库对应的包管理器安装依赖
3. 在生成结构内实现需求
4. 开发模式运行 `qi code dev`，或使用 package scripts 构建
5. 分发 `.qi` 时运行 `qi code build -y`

## 必须遵守的运行时事实

插件不是通过标准 ESM 动态导入加载的。`pluginLoader.ts` 会读取构建后的 JavaScript 文本，并用 `new Function('Vue', code + 'return plugin;')` 执行。

硬约束：

- 构建产物必须暴露名为 `plugin` 的变量
- 桌面开发模式依次查找 `index.js`、`dist/index.js`、`build/index.js`
- 安装 `.qi` 包时，包根目录必须包含 `info.json` 和 `index.js`
- 示例 `vite.config.ts` 里把产物输出成名为 `plugin` 的 IIFE，并设置 `entryFileNames: 'index.js'` 是有意为之
- 纯 ESM 或只有命名导出的产物可能在 `install()` 执行前就加载失败

元数据约束：

- 开发模式下，插件 ID 取所选目录的 basename
- 加载后，`info.json` 可以覆盖 `plugin.name`、`version`、`description`、`author`、`updatedAt`
- 如果存在 `README.md`，它会显示在插件详情页
- 目录名、`package.json.name`、`plugin.name`、`info.json.name` 可以不同，但差异必须是有意的
- 插件依赖桌面 API 时，用 `info.json.platforms` 和 `mobileUnsupportedReason` 明确平台限制

## 工作顺序

1. 先判断插件类型，并选择 `qi code init -t ...` 模板。
   - 最小插件：通常只需要 `install()`。
   - Provider 插件：需要 `registerRegistry()` 和/或 `registerProvider()`。
   - 设置页或复杂 UI 插件：需要 `useForm()`、`useTable()`、`useModal()`、`registerSettings()`、TSX 或 `context.vue`。
   - 内置工具插件：需要 `registerBuiltinTool()`。
   - Hook 或自动化插件：需要 `registerHook()`。
   - 运行时服务插件：需要 `execNodejs()`、`context.api.spawn`、下载、轮询、状态条、持久化配置和清理逻辑。

2. 初始化或定位插件项目。
   - 新插件：使用 `qi code init <plugin-name> -t <template> -d "<description>" -a "<author>" -v "<version>" -y`。
   - 已有插件：改动前先检查 `info.json`、`package.json`、`src/index.ts(x)`、`vite.config.ts`。

3. 改生成代码前先读真实源码。
   - `packages/types/src/plugin.ts`
   - 使用 `context.api` 或 `execNodejs` 时读 `packages/types/src/electron.ts`
   - `packages/qi-cli/example/*` 下最接近需求的示例插件
   - 涉及脚手架、开发模式或打包时读 `packages/qi-cli/src/commands/init.ts`、`dev.ts`、`build.ts`
   - 行为不确定时再读运行时落点：
     - `apps/desktop/src/renderer/src/services/plugins/pluginLoader.ts`
     - `apps/desktop/src/renderer/src/services/plugins/pluginManager.ts`
     - `apps/desktop/src/renderer/src/stores/settings.ts`
     - `apps/desktop/src/renderer/src/services/chatService/registry.ts`

4. 优先保留生成结构或最接近的本地模式。
   - 除非仓库确实需要新结构，否则沿用示例的目录组织、状态流、Vite 配置和 UI 拼装方式。
   - 不要为了单个插件需求重新设计一套插件架构。

5. 验证用户真正会用到的工作流。
   - 构建 `dist`。
   - 如果需求包含分发，打包 `.qi`。
   - 开发模式插件要确认 `package.json` 有 `build:watch` 或 `dev`。
   - 检查 `uninstall()` 是否清理插件拥有的副作用。

## 实现准则

### 入口与构建产物

- 入口通常是 `src/index.ts` 或 `src/index.tsx`。
- 优先写 `const plugin: Plugin = { ... }` 并 `export default plugin`。
- Vite library name 保持为 `plugin`，输出 `dist/index.js`。
- `qi code build` 会把 `dist/` 内容打到 `.qi` 根目录，所以 `dist/index.js` 会成为包根的 `index.js`。
- 不要指望 `info.json.main` 修复非标准桌面入口路径。

### 元数据

- `info.json.name` 是展示/安装元数据，并且可以覆盖代码中的元数据。
- 开发模式下，目录 basename 是用于加载和监听的稳定插件 ID。
- provider id、registry id、hook 名、tool 名、storage key 要稳定。
- 插件使用桌面专属 API 时，设置 `platforms: ["desktop"]` 和清楚的 `mobileUnsupportedReason`。
- 移动端兼容插件应避免 `window.api.fs`、本地进程、桌面路径、PTY、原生文件对话框和桌面桥接服务。

### Provider 插件

- 轻量 provider：通常只注册 `registerRegistry()`；参考 `moonshot-plugin`。
- 完整 provider：先构建配置、表单和运行态，再调用 `registerProvider(PROVIDER_ID, { name, providerType, form, models, logo })`。
- 配置变化会影响模型、表单、logo、状态或行为时，抽 `syncProvider(context)` 统一刷新。
- `registerRegistry()` 定义聊天服务如何创建某类 provider。
- `registerProvider()` 让插件拥有的 provider 出现在设置页和模型选择中。
- 重复调用 `registerProvider()` 刷新 provider 可见数据是可接受的。

### 设置、表单与复杂 UI

- 优先使用 `useForm()`、`useTable()`、`useModal()`、`useDownload()`、`useTerminal()`、`useIcon()`，不要自造散乱 UI。
- 用 `registerSettings(component)` 在插件详情页提供插件设置标签。
- 只有要扩展已有 provider 设置表单时，才用 `registerHook('provider:form-fields', ...)`。
- 响应式插件 UI 使用 `context.vue.ref/reactive/computed/watch/defineComponent/h/markRaw`。
- 示例里已经使用 TSX/JSX，复杂插件设置页可以采用。

### 工具、Hooks 与命令

- 内置工具使用 `registerBuiltinTool(name, tool)`，并提供清楚的 `title`、`description`、`inputSchema` 和可读的 `toolResult.content`。
- hook 必须幂等，并防止重复副作用。
- 已知 hook 名包括 `provider:form-fields`、`ai:before-use`、`speech.stream.start`、`speech.stream.data`、`speech.stream.stop`、`speech.recognize`、`plugin.clearData`。
- 如果插件拥有文件、模型或缓存，实现 `plugin.clearData`，让设置页能真正清理数据。

### 进程、下载与后台任务

- 插件自带 Node.js 脚本时优先用 `execNodejs()`，它默认把 `cwd` 和模块解析基准指向插件目录。
- 调外部二进制时用 `context.api.spawn`、`exec`、`fork` 或 `execFileCommand()`。
- 大文件和进度场景使用 `context.useDownload()` 或 `context.api.net.download()`。
- 临时任务用 `notification.loading()`，常驻状态用 `notification.status(id, text, options)`。
- 进程、定时器、下载、watcher、轮询都要考虑重入保护、超时、取消和卸载清理。

### 持久化与应用状态

- 可恢复的插件配置放插件隔离的 `localforage`。
- 只有必须读写真实应用设置时才用 `getStore('settings')`。
- 模型文件、下载文件、缓存和可清理资源放 `getPluginsDataPath()`。
- 临时运行态放内存；只有用户期望跨重载保存的值才持久化。

### 卸载

非简单插件应实现 `uninstall(context)`，并显式清理：

- 框架没有完全兜底时的 providers 和 registries
- 手动管理的内置工具
- `notification.status()` 创建的常驻状态位，用 `removeStatus()` 移除
- 定时器、watcher、轮询和订阅
- 子进程和服务句柄
- 识别器、模型实例、终端、下载任务和运行时单例

## 验证清单

- 构建产物能否被 `return plugin` 拿到？
- 构建后是否存在 `dist/index.js`？
- `.qi` 包根目录是否包含 `info.json` 和 `index.js`？
- `info.json.name` 对用户是否可读？
- 桌面/移动端平台字段是否正确？
- provider id、registry id、hook 名、tool 名、storage key 是否稳定？
- 配置是否能从 `localforage` 恢复，并在需要时重新同步 provider？
- `uninstall()` 是否清理状态位、定时器、进程、providers、registries、tools 和其他副作用？
- 用户可见错误是否通过 `notification.error()` 或状态位展示？

## 需要细节时再读

- 插件 API 与常用上下文：`references/plugin-api.md`
- 该复制哪个示例插件：`references/example-map.md`
- 插件运行机制与源码级约束：`references/runtime-architecture.md`
