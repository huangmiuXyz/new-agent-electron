import type { App, BrowserWindow, Tray, Menu, Notification, GlobalShortcut, PowerMonitor, Shell, IpcMainEvent, IpcMainInvokeEvent } from 'electron'

/**
 * 主进程插件上下文
 * 直接 require 模式：插件代码与主进程同进程，不做沙箱隔离
 */
export interface MainPluginContext {
  /** 插件稳定 ID（开发模式为目录 basename，安装模式为 info.name） */
  pluginName: string
  /** 插件根目录绝对路径（开发模式为本地目录，安装模式为 userData/plugins/<name>） */
  basePath: string
  /** 从 info.json 解析出的主进程入口相对路径，例如 "main.js" */
  mainEntry: string
  /** 从 info.json 读取的完整元数据 */
  info: Record<string, unknown>
  /** Electron 主进程 API，直接来自 electron 模块，无白名单 */
  electron: MainPluginElectronApi
  /**
   * 注册卸载回调。主进程加载器在 uninstall 完成后会按注册顺序逆序执行。
   * 用于清理 tray / globalShortcut / 自建 BrowserWindow / 定时器等。
   */
  onUnload: (fn: () => void | Promise<void>) => void
  /** 受控日志，统一带插件前缀 */
  logger: MainPluginLogger
  /**
   * 受控的 ipcMain 封装，channel 自动加 `plugin:<pluginName>:` 前缀。
   * 卸载时按前缀批量移除，避免污染其他插件。
   */
  ipc: MainPluginIpc
}

export type MainPluginNativeImage = typeof import('electron').nativeImage

export interface MainPluginElectronApi {
  app: App
  BrowserWindow: typeof BrowserWindow
  Tray: typeof Tray
  Menu: typeof Menu
  Notification: typeof Notification
  globalShortcut: GlobalShortcut
  nativeImage: MainPluginNativeImage
  powerMonitor: PowerMonitor
  shell: Shell
}

export interface MainPluginLogger {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
}

export interface MainPluginIpc {
  /** 等价于 ipcMain.handle('plugin:<name>:<channel>', handler) */
  handle: (channel: string, handler: (event: IpcMainInvokeEvent, ...args: any[]) => any) => void
  /** 等价于 ipcMain.on('plugin:<name>:<channel>', handler) */
  on: (channel: string, handler: (event: IpcMainEvent, ...args: any[]) => void) => void
  /** 等价于 ipcMain.once('plugin:<name>:<channel>', handler) */
  once: (channel: string, handler: (event: IpcMainEvent, ...args: any[]) => void) => void
  /** 移除本插件注册的指定 channel handler */
  removeHandler: (channel: string) => void
  /** 移除本插件注册的指定 channel listener */
  removeListener: (channel: string, handler: (...args: any[]) => void) => void
  /**
   * 向所有未销毁的渲染窗口广播消息，channel 自动加 `plugin:<name>:` 前缀。
   * 等价于遍历 BrowserWindow.getAllWindows() 调用 webContents.send。
   */
  broadcast: (channel: string, ...args: unknown[]) => void
}

/**
 * 主进程插件接口
 * 与渲染端 Plugin 对应，但在主进程执行
 */
export interface MainPlugin {
  /** 插件名称，建议与渲染端 Plugin.name 一致 */
  name: string
  version?: string
  description?: string
  /** 主进程安装函数，在主进程加载器加载插件时调用 */
  install: (context: MainPluginContext) => void | Promise<void>
  /** 主进程卸载函数，清理 tray/快捷键/窗口/定时器等 */
  uninstall?: (context: MainPluginContext) => void | Promise<void>
}

declare global {
  interface MainPlugin extends _MainPlugin { }
  interface MainPluginContext extends _MainPluginContext { }
}

type _MainPlugin = MainPlugin
type _MainPluginContext = MainPluginContext
