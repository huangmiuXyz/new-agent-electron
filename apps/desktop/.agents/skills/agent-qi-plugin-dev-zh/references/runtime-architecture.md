# Runtime Architecture

这些说明来自插件加载器、插件管理器、settings store、provider registry 和 CLI 命令。把它们当成有源码支撑的约束。

## 1. 桌面插件如何加载

关键文件：

- `apps/desktop/src/renderer/src/services/plugins/pluginLoader.ts`
- `apps/desktop/src/renderer/src/services/plugins/pluginManager.ts`

桌面加载流程：

1. 解析插件目录
2. 依次查找 `index.js`、`dist/index.js`、`build/index.js`
3. 以文本形式读取 JavaScript 代码
4. 包装成 `new Function('Vue', code + 'return plugin;')`
5. 执行并拿到 `plugin`
6. 可用时读取 `info.json` 和 README 元数据
7. 用 `PluginManager.createContext()` 创建上下文
8. 调用 `plugin.install(context)`

影响：

- 构建产物必须暴露名为 `plugin` 的变量
- Vite `lib.name = 'plugin'` 的 IIFE 输出是有意设计
- 只要最终 bundle 仍暴露 `plugin`，`export default plugin` 没问题
- `info.json.main` 是元数据；不要依赖它改变桌面 loader 的入口查找逻辑

## 2. 开发模式与安装模式

### 开发模式

- 从用户选择的本地目录加载
- 插件 ID 是目录 basename
- 所选路径保存在 `devPlugins`
- 目录会被监听，变化触发 reload
- loader 能找到 `dist/index.js`，所以普通 Vite 构建产物可用

### 安装模式

- `.qi` 包会解压到用户插件目录
- 包根目录必须包含 `info.json` 和 `index.js`
- `qi code build` 通过把 `dist/` 内容压到包根目录实现这一点
- README 和 `extraAssets` 可以一并包含

## 3. 移动端包加载

loader 也支持移动端存储的插件包。

重要平台行为：

- `info.json.platforms` 控制插件支持 `desktop` 还是 `mobile`
- 缺失或为空的 `platforms` 表示所有平台都支持
- `mobileUnsupportedReason` 可以解释为什么桌面专属插件不能在移动端运行
- 移动端插件不能假设有本地文件系统、本地进程、PTY 或原生对话框等桌面 preload API

如果插件需要移动端可用，运行依赖应尽量偏 API/网络，并确认真实可用的 API 范围。

## 4. 元数据归属

代码加载后，`pluginLoader` 会读取 `info.json`：

- `plugin.name = info.name || pluginName`
- 存在时复制 `version`、`description`、`author`、`updatedAt`
- README 内容可附加到插件信息并用于展示

结论：

- 代码里的元数据不是唯一来源
- 展示名应维护在 `info.json`
- 开发模式身份可以不同于展示名
- 名称不一致会让 reload、设置页展示和 provider 归属更难判断

## 5. 插件上下文如何创建

`PluginManager.createContext()` 注入：

- `window.api`
- `pinia`、`router` 和 app
- `context.vue`
- `useForm`、`useTable`、`useDownload`、`useModal`、`useTerminal`、`useIcon`
- `registerSettings` 和 `unregisterSettings`
- 插件隔离的 `localforage`
- 带插件本地默认值的 `execNodejs()`
- 通过 `getStore()` 访问 store
- notification helpers

有用细节：

- 桌面端 `getPluginsDataPath()` 会返回用户数据目录下的插件专属数据目录
- 适合放模型、下载文件、缓存和可清理资源

## 6. Provider 如何可见

关键文件：

- `apps/desktop/src/renderer/src/services/plugins/pluginManager.ts`
- `apps/desktop/src/renderer/src/stores/settings.ts`
- `apps/desktop/src/renderer/src/pages/settings/provider.vue`

流程：

1. 插件调用 `registerProvider(providerId, options)`
2. `PluginManager` 在 `registeredProviders` 中写入或更新记录
3. `settings.ts` 通过 `getAllProviders` 合并内置 `providers` 与 `registeredProviders`
4. 设置页和模型选择使用合并后的列表

因此：

- 插件 provider 是动态 provider 记录，不是直接改内置 provider 列表
- provider 记录带有 `pluginName`
- 重复注册会刷新插件拥有的 provider
- 卸载可以移除插件 provider，并清理部分相关默认模型引用

## 7. Registry 与 Provider Type

关键文件：

- `apps/desktop/src/renderer/src/services/chatService/registry.ts`

`registerRegistry(name, factory, options?)`：

- 按 type/name 注册 provider factory
- 让聊天服务能实例化该 provider type
- 可用 `{ hide: true }` 隐藏

一般规则：

- `registerRegistry()` 定义“怎么构造”
- `registerProvider()` 定义“用户在哪里看到/选择”

复杂 provider 插件通常两者都需要。

## 8. 清理职责

`PluginManager.unregisterPlugin()` 会自动移除插件拥有的：

- commands
- hooks
- built-in tools
- registry 记录
- registered providers 以及部分默认模型引用
- 插件设置表单

但 `uninstall()` 仍应清理框架无法完全知道的资源：

- 常驻 `notification.status()` 状态位
- 定时器、watcher、轮询、订阅
- 子进程和本地服务
- terminal 会话、识别器、模型实例
- 下载任务和临时文件
- 插件拥有的运行时单例

非简单插件要显式清理。

## 9. 重要 CLI 行为

关键文件：

- `packages/qi-cli/src/commands/init.ts`
- `packages/qi-cli/src/commands/dev.ts`
- `packages/qi-cli/src/commands/build.ts`

规则：

- 生成模板使用 Vite library mode，IIFE 输出，`entryFileNames: 'index.js'`
- `qi code dev` 要求有 `package.json`，并运行 `build:watch` 或 `dev`
- `qi code build` 会向上查找 `info.json`
- build 要求存在 `dist/`
- build 会更新 `info.json.updatedAt`，可选更新 version，并写出 `.qi`
- 存在 `extraAssets` 时会把这些条目复制进包内

## 10. 常见失败模式

- bundle 没暴露 `plugin`：loader 在 install 前报错
- 包里是 `dist/index.js` 而不是根目录 `index.js`：安装态插件失败
- 开发目录 basename 与 `info.json.name` 意外漂移：reload/provider 归属混乱
- 注册 provider 但没有匹配 registry：UI 看得到 provider，但聊天无法实例化
- 注册 registry 但没有 provider：provider type 存在，但设置页没有 provider
- 创建状态位但不移除：卸载后残留 UI
- 启动本地进程但不清理：残留孤立服务
- 桌面专属插件标成移动端兼容：移动端加载失败或缺 API
