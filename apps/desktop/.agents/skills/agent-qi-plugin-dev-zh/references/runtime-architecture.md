# Runtime Architecture

这些内容来自插件加载器、插件管理器、settings store 和 registry 实现，是写技能时最该优先信任的“硬约束”。

## 1. 插件如何被加载

关键文件：

- `apps/desktop/src/renderer/src/services/plugins/pluginLoader.ts`
- `apps/desktop/src/renderer/src/services/plugins/pluginManager.ts`

桌面端流程大致是：

1. 在插件目录里寻找 `index.js`、`dist/index.js` 或 `build/index.js`
2. 读取代码文本
3. 拼成 `new Function('Vue', code + 'return plugin;')`
4. 执行后拿到 `plugin` 对象
5. 再用 `PluginManager.createContext()` 创建上下文并调用 `plugin.install(context)`

因此你必须假设：

- 产物需要能暴露名为 `plugin` 的变量
- 入口文件名通常应该稳定为 `index.js`
- 示例里用 Vite IIFE 并设置 `lib.name = 'plugin'` 不是偶然

## 2. 元数据谁说了算

加载后，`pluginLoader` 会再读 `info.json` 和 `README.md`：

- `info.json` 可覆盖 `plugin.name`
- 也会覆盖 `version/description/author/updatedAt`
- `README.md` 会进入插件详情页展示

这意味着：

- 代码里的元数据不是唯一来源
- `info.json` 应当始终保持正确
- README 是值得维护的用户可见文档

## 3. 开发态与安装态的差异

### 开发态

- 通过“Development Mode”选择本地目录
- 插件 ID 取目录名
- loader 会记录本地路径并监视文件变化
- 变更后自动 reload

### 安装态

- `.qi` 包安装后解压到用户插件目录
- 安装包必须包含 `info.json` 和 `index.js`
- 可包含 README 与额外资源

## 4. 插件上下文如何创建

`PluginManager.createContext()` 会注入：

- `window.api`
- `pinia/router/app`
- `context.vue`
- `useForm/useTable/useDownload/useModal/useTerminal/useIcon`
- 插件隔离的 `localforage` 实例，实例名就是插件名
- settings / chats / notes / knowledge / agent store 访问能力

一个很重要的细节：

- `getPluginsDataPath()` 会给当前插件生成独立数据目录
- 适合保存模型、下载文件和缓存资源

## 5. provider 实际如何进入界面

关键文件：

- `pluginManager.ts`
- `stores/settings.ts`
- `pages/settings/provider.vue`

真实过程：

1. 插件调用 `registerProvider(providerId, options)`
2. `PluginManager` 向 `registeredProviders` 写入记录
3. `settings.ts` 中 `getAllProviders` 把 `providers` 与 `registeredProviders` 合并
4. provider 设置页与聊天选择器使用这个合并结果

所以：

- 插件 provider 不是直接写死到默认 providers 列表里
- 它们是带 `pluginName` 的“动态 provider”
- 卸载时可以按 `pluginName` 反向清理

## 6. registry 与 providerType 的关系

关键文件：

- `apps/desktop/src/renderer/src/services/chatService/registry.ts`

`registerRegistry(name, factory)` 的效果：

- 给 provider factory registry 增加一个 providerType
- 这个 type 可被聊天服务创建 provider 实例
- 若不是隐藏 registry，还会出现在 provider type 下拉中

一般规律：

- `registerRegistry()` 负责“怎么创建 provider”
- `registerProvider()` 负责“让这个 provider 出现在 UI 和设置里”

复杂插件往往两者都用。

## 7. 框架会帮你清理什么，不会帮你清理什么

`PluginManager.unregisterPlugin()` 会自动清理：

- 该插件注册的 commands
- hooks
- builtin tools
- registries 记录
- registeredProviders 以及部分默认模型引用

但你仍然应该在 `uninstall()` 手动清理：

- `notification.status()` 产生的状态位
- 定时器、轮询
- 子进程
- 模型实例、音频识别器之类运行时对象
- 你自己额外注册或持有的资源

不要把所有清理都赌在框架上。
