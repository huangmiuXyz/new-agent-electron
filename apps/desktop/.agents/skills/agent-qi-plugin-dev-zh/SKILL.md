---
name: agent-qi-plugin-dev-zh
description: 面向 Agent-Qi / agent-qi-electron 的中文插件开发技能。用于创建、修改、调试、重构或打包本应用插件时触发，尤其适合处理 `info.json`、`src/index.ts(x)`、provider 注册、设置表单、内置工具、状态通知、本地存储、下载/模态框 UI，以及 `packages/qi-cli/example/*` 下示例插件的复用与仿写。
---

# Agent-Qi 插件开发

按 Agent-Qi 当前仓库的真实约定实现插件，而不是只输出泛泛的 TypeScript 或 Vite 示例。优先复用现有示例插件、`@agent-qi/types` 类型、插件加载器和 `qi code` 工作流。

## 先理解运行时约束

在这个仓库里，插件不是通过标准 ESM 动态导入加载的，而是由 `pluginLoader.ts` 读取构建产物文本，再用 `new Function(... return plugin)` 执行。

这直接带来几个硬约束：

- 构建产物里最终必须能拿到一个名为 `plugin` 的全局变量
- 入口产物通常是 `index.js`
- 示例里的 `vite.config.ts` 普遍把库名写成 `plugin`，并输出 IIFE 到 `dist/index.js`
- 如果你随手改成别的导出方式，运行时很可能根本加载不起来

另外，运行时元数据不是完全以代码为准：

- 安装态和已安装插件加载时，`info.json` 会覆盖代码里的 `name/version/description/author/updatedAt`
- 开发态插件的“插件 ID”取目录名，显示名可以来自 `info.json.name`
- 因此不要随意让目录名、`package.json.name`、`plugin.name`、`info.json.name` 四者完全脱节

## 工作方式

1. 先判断插件属于哪一类。
   - 最小插件 / Hello World：只需要 `install()`，通常从 `hello-world` 风格开始。
   - Provider 插件：需要 `registerRegistry()` 和/或 `registerProvider()`，参考 `moonshot-plugin`、`minimax-plugin`、`llama-cpp-plugin`。
   - 带设置表单或界面的插件：需要 `useForm()`、`useTable()`、`useModal()`、`context.vue`，参考 `civitai-plugin`、`vosk-speech-recognition`、`codex-proxy-plugin`。
   - 工具型插件：需要 `registerBuiltinTool()`，参考 `smart-api-key-filler`。
   - 运行时服务插件：需要 `context.api.spawn`、轮询、状态通知、持久化配置，参考 `ollama-starter`、`llama-cpp-plugin`。

2. 动手前先读这些文件。
   - [`packages/types/src/plugin.ts`](e:\code\private\agent-qi-electron\packages\types\src\plugin.ts)
   - 目标相近的示例插件目录
   - 如需脚手架或打包流程，再看 `packages/qi-cli/src/commands/init.ts`、`dev.ts`、`build.ts`

3. 先匹配最接近的示例，再开始改。
   - 不要凭空设计一套新插件结构。
   - 如果需求接近某个现有示例，尽量沿用它的目录组织、状态管理和 UI 拼装方式。

4. 同时查看运行时落点。
   - `apps/desktop/src/renderer/src/services/plugins/pluginLoader.ts`
   - `apps/desktop/src/renderer/src/services/plugins/pluginManager.ts`
   - `apps/desktop/src/renderer/src/stores/settings.ts`
   - `apps/desktop/src/renderer/src/services/chatService/registry.ts`
   - 这些文件决定了“插件 API 实际会造成什么副作用”

## 默认开发流程

1. 明确产物类型。
   - 只是注册 provider
   - 只是补一个内置工具
   - 需要在设置页展示复杂表单或表格
   - 需要管理本地进程、下载、模型、账号等长期状态

2. 建立最小骨架。
   - 保持入口文件导出 `default plugin`
   - `plugin.name` 保持稳定且可作为插件标识
   - `info.json` 中的 `name` 是展示名；`package.json` 的 `name` 是包名；两者不要混淆

3. 接入 Agent-Qi API。
   - provider 能力：`registerRegistry()`、`registerProvider()`、`unregisterProvider()`
   - 工具能力：`registerBuiltinTool()`、`unregisterBuiltinTool()`
   - 钩子能力：`registerHook()`
   - UI 能力：`useForm()`、`useTable()`、`useModal()`、`useDownload()`、`useIcon()`
   - 持久化能力：`localforage`、`getStore('settings')`
   - 系统能力：`context.api` 下的 `fs/path/os/spawn`
   - 反馈能力：`notification.success/error/info/warning/loading/status`

4. 保持“配置源”清晰。
   - 短期运行态放内存变量
   - 可恢复配置放 `localforage`
   - 如果需要真正同步到应用设置，使用 `settings` store
   - 改完配置后，若影响 provider 可见行为，立即重新 `registerProvider()` 同步

5. 验证真实工作流。
   - 构建 `dist`
   - 打包 `.qi`
   - 如是开发态插件，确认 `qi code dev` 所需脚本存在
   - 检查 `uninstall()` 是否清理 provider、registry、status、tool、timer

## 实现准则

### 入口与元数据

- 入口通常是 `src/index.ts` 或 `src/index.tsx`
- 必须导出 `const plugin: Plugin = { ... }` 并 `export default plugin`
- `install(context)` 是主入口
- 如插件注册了 provider/tool/status/timer/process，通常都应实现 `uninstall(context)`

### Provider 插件

- 轻量 provider：
  - 仅 `registerRegistry()` 暴露 provider 工厂
  - 示例：`moonshot-plugin`
- 完整 provider：
  - 先构造配置表单或运行态
  - 再 `registerProvider(PROVIDER_ID, { name, providerType, form, models, logo })`
  - 示例：`llama-cpp-plugin`、`civitai-plugin`
- 如果配置变化会影响模型列表、logo、表单或行为，抽一个 `syncProvider(context)` 统一刷新 provider 注册
- 要理解 `registerProvider()` 的真实语义：
  - 它写入的是 settings store 里的 `registeredProviders`
  - UI 层通过 `getAllProviders = providers + registeredProviders` 合并展示
  - 所以插件 provider 不会直接改掉内置 provider 列表本体，而是以“附加 provider”的方式出现
- 卸载时，`PluginManager.unregisterPlugin()` 会尝试移除该插件注册的 provider，并清理相关默认模型选择

### 设置表单与复杂 UI

- 优先使用 `useForm()`、`useTable()`、`useModal()` 组合，而不是自造散乱 DOM
- 需要响应式状态时使用 `context.vue.ref/reactive/computed/watch`
- JSX/TSX 模式在示例里是可行的，复杂设置页可参考：
  - `civitai-plugin`
  - `vosk-speech-recognition`
  - `codex-proxy-plugin`
- 如果你想给主应用已有 provider 设置页追加字段，不一定非要注册一个独立 provider
  - 可以像 `ollama-starter` 一样用 `registerHook('provider:form-fields', ...)`
  - 这些字段会被 `pages/settings/provider.vue` 收集并拼进 provider 表单

### 内置工具插件

- 用 `registerBuiltinTool()` 暴露工具
- 给出清晰的 `title`、`description`、`inputSchema`
- `execute()` 返回可读的 `toolResult.content`
- 示例：`smart-api-key-filler`

### 钩子与自动化行为

- 需要在请求前、provider 配置阶段、应用生命周期阶段插入逻辑时，用 `registerHook()`
- 示例：`ollama-starter` 在 `ai:before-use` 中做自启动判断
- 钩子里优先做幂等判断，避免重复副作用
- 这个仓库里已经能看见的实际 hook 用法包括：
  - `provider:form-fields`
  - `ai:before-use`
  - `speech.stream.start`
  - `speech.stream.data`
  - `speech.stream.stop`
  - `speech.recognize`
  - `plugin.clearData`
- 如果插件保存了本地文件或缓存，最好实现 `plugin.clearData`，这样设置页里的“清除缓存”才能真正清掉插件资产

### 状态通知与后台任务

- 长任务不要只打一条日志，优先用 `notification.loading()` 或 `notification.status()`
- 若有轮询、定时器、下载任务、子进程，必须考虑：
  - 重入保护
  - 超时
  - 取消
  - 卸载时清理
- 复杂状态条可参考 `llama-cpp-plugin`、`vosk-speech-recognition`
- `notification.status(id, text, options)` 可用于常驻状态位；卸载时通常要 `removeStatus(id)`
- `context.useDownload()` 会自动按插件名隔离下载任务来源，适合模型下载、资源下载
- `context.getPluginsDataPath()` 返回插件专属数据目录，适合放模型和可清理资源

## 真正写插件时的仓库级约定

### 关于 Vite 输出

- 优先保持示例插件的 `vite.config.ts` 形态
- 核心目标：
  - 输出到 `dist/`
  - 入口文件名是 `index.js`
  - 库名是 `plugin`
  - 尽量保证运行时能被 `pluginLoader` 直接执行

### 关于元数据

- `info.json.name` 更接近展示名和安装目录名
- 开发态下，目录名会成为插件 ID
- 代码里的 `plugin.name` 仍应与目标插件身份保持一致，不要写成临时名字
- 如果四处名称不一致，恢复加载、DEV 识别、设置页展示都更容易出问题

### 关于卸载

不要只实现 `install()`，还要问自己卸载时谁来清理：

- `registerProvider()`
- `registerRegistry()`
- `registerBuiltinTool()`
- `notification.status()`
- 定时器 / 轮询
- 本地子进程
- 下载相关状态
- 运行时单例

复杂插件应显式在 `uninstall()` 中清理，而不要完全依赖框架兜底

## 文件与构建约定

- 最小插件通常至少包含：
  - `package.json`
  - `info.json`
  - `src/index.ts` 或 `src/index.tsx`
  - `vite.config.ts`
  - `dist/` 构建产物
- `qi code build` 会把 `info.json` 和 `dist/` 打进 `.qi`
- `info.json.extraAssets` 可把额外文件或目录一并打包
- `qi code dev` 依赖 `package.json` 中的 `build:watch` 或 `dev` 脚本

## 做与不做

要做：

- 从相近示例开始改
- 引用 `@agent-qi/types`
- 保持 provider id、registry id、storage key 稳定
- 在复杂插件中抽出 `normalizeConfig`、`syncProvider`、`saveConfig` 之类的辅助函数
- 让错误信息对最终用户可见

不要做：

- 只写“如何运行 qi cli”而不实现插件逻辑
- 假设插件 API 与普通 Electron/Vue 插件系统相同
- 把所有状态都塞进全局变量却不持久化
- 注册了 provider/tool/hook/status 后忘记卸载清理
- 忽略现有示例，重新发明设置表单或 provider 同步方式

## 需要细节时再读

- 插件 API 与常用上下文：`references/plugin-api.md`
- 该仓库示例插件怎么选、适合抄哪一类：`references/example-map.md`
- 插件运行机制与源码级约束：`references/runtime-architecture.md`
