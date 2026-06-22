# 主进程插件 (Main-Process Plugin)

实现需要运行在 Electron 主进程的插件代码时读这个文件。主进程插件与渲染端插件在同一个插件项目内，分文件、双入口。

优先参考源码：

- `packages/types/src/mainPlugin.ts`
- `packages/types/src/electron.ts`（`pluginMain` 字段）
- `apps/desktop/src/main/services/pluginMainLoader.ts`
- `apps/desktop/src/main/index.ts`（`plugin:main:load` / `unload` / `reload` IPC）
- `apps/desktop/src/preload/index.ts`（`api.pluginMain`）
- `apps/desktop/src/renderer/src/services/plugins/pluginLoader.ts`（接入点）
- `packages/qi-cli/example/opencode-usage-monitor`（双入口示例）

## 1. 什么时候用主进程插件

主进程插件能访问 Electron 主进程独有对象，渲染端 `context.api` 拿不到的：

- `BrowserWindow`：创建独立原生窗口
- `Tray` / `Menu`：系统托盘、原生菜单
- `globalShortcut`：全局快捷键
- `Notification`（主进程版）：系统通知
- `powerMonitor`：电源事件
- `shell`（主进程版）

不需要这些能力的插件不要加主进程入口，保持纯渲染端插件更简单。

## 2. 项目结构（双入口）

```
my-plugin/
├── info.json                # mainEntry 声明主进程入口
├── package.json             # build 串行构建两端
├── vite.config.ts           # 渲染端 → dist/index.js (IIFE, 暴露 plugin)
├── vite.main.config.ts      # 主进程 → dist/main.js  (CJS,  暴露 mainPlugin)
├── dev.mjs                  # 零依赖并行 watch 两端
└── src/
    ├── index.ts             # 渲染入口（Plugin 对象，照旧）
    └── main.ts              # 主进程入口（MainPlugin 对象）
```

## 3. info.json 字段

```json
{
  "name": "my-plugin",
  "mainEntry": "main.js",
  "platforms": ["desktop"],
  "mobileUnsupportedReason": "Requires main-process Electron APIs."
}
```

- `mainEntry`：主进程入口文件名。写 `main.js` 即可，加载器会依次查找 `<pluginDir>/main.js`、`<pluginDir>/dist/main.js`、`<pluginDir>/build/main.js`，覆盖开发模式（dist/main.js）和安装模式（.qi 包根 main.js）。
- 没有 `mainEntry` → 纯渲染插件，走老路径。
- 有 `mainEntry` → 强制 `platforms: ["desktop"]`，主进程能力移动端不可用。

## 4. 主进程入口约定

`src/main.ts` 导出一个 `MainPlugin` 对象：

```ts
import type { MainPlugin } from '@agent-qi/types'

const mainPlugin: MainPlugin = {
  name: 'my-plugin',  // 建议与渲染端 Plugin.name 一致
  install: (ctx) => {
    // ctx.electron.{app, BrowserWindow, Tray, Menu, Notification, globalShortcut, nativeImage, powerMonitor, shell}
    // ctx.ipc.handle / ctx.ipc.on
    // ctx.onUnload(fn)
    // ctx.logger.info/warn/error
  },
  uninstall: (ctx) => {
    // 清理 tray、快捷键、窗口等
  }
}

export default mainPlugin
```

## 5. MainPluginContext 能力

### ctx.electron

直接来自 `electron` 模块，无白名单：

- `app`
- `BrowserWindow`
- `Tray`
- `Menu`
- `Notification`
- `globalShortcut`
- `nativeImage`
- `powerMonitor`
- `shell`

### ctx.ipc

受控的 `ipcMain` 封装，channel 自动加 `plugin:<pluginName>:` 前缀。卸载时按前缀批量移除，不污染其他插件。

- `ctx.ipc.handle(channel, handler)`：等价 `ipcMain.handle('plugin:<name>:<channel>', handler)`
- `ctx.ipc.on(channel, handler)`：等价 `ipcMain.on(...)`
- `ctx.ipc.once(channel, handler)`
- `ctx.ipc.removeHandler(channel)`
- `ctx.ipc.removeListener(channel, handler)`
- `ctx.ipc.broadcast(channel, ...args)`：向所有未销毁的渲染窗口广播消息，等价遍历 `BrowserWindow.getAllWindows()` 并 `webContents.send`

channel 不能包含 `:`，否则 `channelFor()` 会抛错。

渲染端调用：
```ts
context.api.pluginMain.ipc.invoke(pluginName, 'my-channel', ...args)  // 自带 15s 超时
context.api.pluginMain.ipc.on(pluginName, 'my-channel', callback)     // 返回 unsubscribe 函数
```

### ctx.onUnload(fn)

注册卸载回调。加载器在 `uninstall()` 完成后按注册逆序执行。用于清理 tray、globalShortcut、BrowserWindow、定时器等。

### ctx.logger

带 `[plugin-main:<name>]` 前缀的 `info` / `warn` / `error`。

## 6. Vite 配置

### vite.main.config.ts

```ts
import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/main.ts'),
      name: 'mainPlugin',
      fileName: 'main',
      formats: ['cjs']
    },
    rollupOptions: {
      output: {
        dir: 'dist',
        entryFileNames: 'main.js',
        inlineDynamicImports: true
      },
      external: ['electron']
    },
    outDir: 'dist',
    emptyOutDir: false,  // 不能清空，否则会删掉渲染端的 index.js
    minify: false,
    target: 'esnext'
  }
})
```

关键点：

- `formats: ['cjs']`：主进程加载器用 `createRequire` + `require()` 加载，需要 CJS。
- `external: ['electron']`：electron 不能打进 bundle。
- `emptyOutDir: false`：避免主进程构建清空渲染端产物。
- `fileName: 'main'` + `entryFileNames: 'main.js'`：输出 `dist/main.js`。
- 构建产物会直接把 `mainPlugin` 对象摊到 `module.exports` 上（CJS default export 行为），加载器的 `required?.default ?? required?.mainPlugin ?? required` fallback 链会命中 `required` 本身。

### package.json scripts

```json
{
  "build": "vite build && vite build --config vite.main.config.ts",
  "dev": "node dev.mjs"
}
```

`dev.mjs` 用 `createRequire` 解析 vite bin 绝对路径，跨平台并行 watch 两端，不依赖 `concurrently`。参考 `opencode-usage-monitor/dev.mjs`。

## 7. 加载与卸载时序

### 加载

1. 渲染端 `pluginLoader.loadPlugin` 读 `info.json`，发现 `mainEntry`
2. 调 `window.api.pluginMain.load({ pluginName, pluginDir, mainEntry, info })`
3. 主进程 `pluginMainLoader` 用 `createRequire(pluginDir/package.json)` + `require(entryPath)` 加载主进程代码
4. 调用 `mainPlugin.install(ctx)`，注册 IPC handler、创建对象
5. 主进程加载**先于**渲染端 `install`，渲染端可立即用 `ctx.api.pluginMain.ipc` 与主进程通信

### 卸载

1. 渲染端 `pluginLoader.unloadPlugin` 先调渲染端 `plugin.uninstall()`
2. 再调 `window.api.pluginMain.unload(pluginName)`
3. 主进程加载器调 `mainPlugin.uninstall(ctx)`
4. 执行 `onUnload` 注册的清理回调（逆序）
5. 按 `plugin:<name>:` 前缀批量移除所有 IPC handler/listener

### 热重载

`reloadPlugin` 复用 `unload + load`，主进程侧自动跟着重载。改 `src/main.ts` 后需要 `vite build --config vite.main.config.ts` 重建 `dist/main.js`，Agent-Qi 监听到 dist 变化触发 reload。

## 8. 打包

`qi code build` 把 `dist/` 内容压平到 `.qi` 包根。所以 `dist/index.js` → 包根 `index.js`，`dist/main.js` → 包根 `main.js`。`info.json` 的 `mainEntry: "main.js"` 在安装模式下直接命中包根 `main.js`。

不需要改 `build.ts`，现有打包逻辑天然支持双入口。

## 9. 两端通信模式

所有 IPC 通道名采用 `plugin:<pluginName>:<channel>` 三段式约定。主进程侧 `ctx.ipc` 自动加前缀，渲染端侧 `pluginMain.ipc` 手动拼接，两端 byte 一致才能配对。

### 渲染端 → 主进程（请求-响应）

```ts
// 渲染端（返回 Promise，15s 超时自动 reject）
const result = await context.api.pluginMain.ipc.invoke(pluginName, 'my-action', arg1)

// 主进程
ctx.ipc.handle('my-action', (event, arg1) => {
  return { ok: true }
})
```

### 主进程 → 渲染端（推送）

```ts
// 主进程 — 用 broadcast 向所有窗口推送
ctx.ipc.broadcast('my-event', data1, data2)

// 渲染端 — 订阅推送
const unsub = context.api.pluginMain.ipc.on(pluginName, 'my-event', (data1, data2) => {
  // 处理推送
})
// 卸载时必须调用 unsub() 防止泄漏
```

`ctx.ipc.broadcast` 优于手写 `for...of BrowserWindow.getAllWindows()`，因为它自动处理前缀拼接、窗口销毁检查和异常吞没。

### 推荐：类型协议模式

双入口插件推荐提取 `src/protocol.ts`，用一个 `PluginProtocol` 接口集中声明所有通道的 args/result 类型，然后通过 `createMainBridge` / `createRendererBridge` 获得编译期类型推导：

```ts
// src/protocol.ts
export interface PluginProtocol {
  'show-window': { args: []; result: { ok: boolean } }
  'hide-window': { args: []; result: { ok: boolean } }
  'workspace-data': { args: [{ workId: string; authCookie: string }]; result: void }
}
```

两端使用同一份协议定义，channel 名拼错或 payload 类型不匹配在编译期报错。参考 `packages/qi-cli/example/opencode-usage-monitor/src/protocol.ts`。

### 窗口数据同步

主进程窗口是独立的 `BrowserWindow`，不共享渲染端状态。推荐模式：

1. 主进程缓存 `lastData`
2. 捕获到数据后调用 `ctx.ipc.broadcast('channel', lastData)`
3. `show-window` 时若 `lastData` 存在则再次 `broadcast`，实现回放，避免打开瞬间空白
4. 渲染端 `bridge.on('channel', handler)` 接收后保存配置并刷新 UI

参考 `opencode-usage-monitor/src/main.ts` 的 `lastData` + `show-window` 回放时序处理。

## 10. 卸载清理清单

### 主进程侧

主进程插件必须清理：

- `BrowserWindow`：`win.destroy()`
- `Tray`：`tray.destroy()`
- `globalShortcut`：`globalShortcut.unregister(...)`
- 定时器：`clearInterval` / `clearTimeout`
- 自定义 IPC handler：框架按前缀自动清理，但 `onUnload` 里手动 `removeHandler` 更清晰

用 `ctx.onUnload(fn)` 注册清理回调，或实现 `uninstall(ctx)` 显式清理。两者都会被执行。

### 渲染端侧

渲染端 `uninstall()` 必须清理：

- `pluginMain.ipc.on` 返回的 unsubscribe 函数（最常见的泄漏源）
- `setInterval` / `setTimeout`
- `notification.status()` 创建的常驻状态位（`removeStatus()`）

## 11. 常见失败模式

- `info.json` 写了 `mainEntry` 但没建 `dist/main.js`：主进程加载失败，渲染端 console.error 可见
- `vite.main.config.ts` 忘了 `external: ['electron']`：bundle 把 electron 打进去，require 报错
- `emptyOutDir: true`：主进程构建清空 dist，删掉渲染端 `index.js`
- `dev` 脚本只 watch 渲染端：改 `src/main.ts` 后 `dist/main.js` 不更新，主进程跑的还是旧代码
- 主进程窗口 `loadURL` 后立即 `executeJavaScript`：DOM 未 ready，注入丢失。用 `did-finish-load` / `dom-ready` 事件等待
- 主进程 handler 卡死无返回：渲染端 `invoke` 15s 后超时 reject `PluginIpcTimeoutError`，捕获处理
- `pluginMain.ipc.on` 不存 unsubscribe 函数：热重载后监听器重复注册，消息处理多次。**必须存储并在 `uninstall` 调用**
- channel 名包含 `:`：`channelFor()` 抛错，插件加载失败。channel 只能使用字母、数字、连字符、下划线
- `ctx.ipc.broadcast` 在非桌面环境调用：不会抛出，但无效果。保持渲染端通过 `createRendererBridge` 的 `null` 检查处理移动端降级
