import { app, BrowserWindow, Tray, Menu, Notification, globalShortcut, nativeImage, powerMonitor, shell, ipcMain as electronIpcMain, type IpcMainEvent } from 'electron'
import { existsSync } from 'fs'
import { join, isAbsolute } from 'path'
import { createRequire } from 'node:module'
import type { MainPlugin, MainPluginContext, MainPluginIpc } from '@agent-qi/types'

type LoadedEntry = {
  plugin: MainPlugin
  context: MainPluginContext
  cleanupFns: Array<() => void | Promise<void>>
  /** 本插件注册的 ipcMain handler channel 全名列表 */
  registeredHandlerChannels: Set<string>
  /** 本插件注册的 ipcMain on/once listener 全名 channel -> handlers */
  registeredListeners: Map<string, Set<(...args: any[]) => void>>
}

const IPC_PREFIX = 'plugin'

const channelFor = (pluginName: string, channel: string): string => {
  if (!channel) throw new Error('ipc channel is required')
  return `${IPC_PREFIX}:${pluginName}:${channel}`
}

const logPrefix = (pluginName: string): string => `[plugin-main:${pluginName}]`

export class PluginMainLoader {
  private loaded: Map<string, LoadedEntry> = new Map()

  isLoaded(pluginName: string): boolean {
    return this.loaded.has(pluginName)
  }

  async load(payload: {
    pluginName: string
    pluginDir: string
    mainEntry: string
    info: Record<string, unknown>
  }): Promise<{ ok: boolean; error?: string }> {
    const { pluginName, pluginDir, mainEntry, info } = payload

    if (this.loaded.has(pluginName)) {
      await this.unload(pluginName).catch((error) => {
        console.warn(`${logPrefix(pluginName)} unload before reload failed:`, error)
      })
    }

    const entryPath = this.resolveEntryPath(pluginDir, mainEntry)
    if (!entryPath) {
      const tried = [mainEntry, join('dist', mainEntry), join('build', mainEntry)]
        .map((p) => (isAbsolute(p) ? p : join(pluginDir, p)))
        .join(', ')
      return { ok: false, error: `main entry not found. tried: ${tried}` }
    }

    const cleanupFns: Array<() => void | Promise<void>> = new Array()
    const registeredHandlerChannels = new Set<string>()
    const registeredListeners = new Map<string, Set<(...args: any[]) => void>>()

    const logger = {
      info: (...args: unknown[]) => console.info(logPrefix(pluginName), ...args),
      warn: (...args: unknown[]) => console.warn(logPrefix(pluginName), ...args),
      error: (...args: unknown[]) => console.error(logPrefix(pluginName), ...args)
    }

    const ipc: MainPluginIpc = {
      handle: (channel, handler) => {
        const full = channelFor(pluginName, channel)
        if (registeredHandlerChannels.has(full)) {
          electronIpcMain.removeHandler(full)
        }
        electronIpcMain.handle(full, handler)
        registeredHandlerChannels.add(full)
      },
      on: (channel, handler) => {
        const full = channelFor(pluginName, channel)
        electronIpcMain.on(full, handler)
        let set = registeredListeners.get(full)
        if (!set) {
          set = new Set()
          registeredListeners.set(full, set)
        }
        set.add(handler as (...args: any[]) => void)
      },
      once: (channel, handler) => {
        const full = channelFor(pluginName, channel)
        const wrapped = (...args: any[]) => {
          handler(...args as [IpcMainEvent, ...any[]])
          set?.delete(wrapped)
        }
        electronIpcMain.once(full, wrapped)
        let set = registeredListeners.get(full)
        if (!set) {
          set = new Set()
          registeredListeners.set(full, set)
        }
        set.add(wrapped)
      },
      removeHandler: (channel) => {
        const full = channelFor(pluginName, channel)
        if (registeredHandlerChannels.has(full)) {
          electronIpcMain.removeHandler(full)
          registeredHandlerChannels.delete(full)
        }
      },
      removeListener: (channel, handler) => {
        const full = channelFor(pluginName, channel)
        const set = registeredListeners.get(full)
        if (!set) return
        electronIpcMain.removeListener(full, handler as any)
        set.delete(handler as (...args: any[]) => void)
        if (set.size === 0) registeredListeners.delete(full)
      }
    }

    const context: MainPluginContext = {
      pluginName,
      basePath: pluginDir,
      mainEntry,
      info,
      electron: {
        app,
        BrowserWindow,
        Tray,
        Menu,
        Notification,
        globalShortcut,
        nativeImage,
        powerMonitor,
        shell
      },
      onUnload: (fn) => {
        if (typeof fn === 'function') cleanupFns.push(fn)
      },
      logger,
      ipc
    }

    try {
      const pluginRequire = createRequire(join(pluginDir, 'package.json'))
      delete pluginRequire.cache[entryPath]
      const required = pluginRequire(entryPath)
      const plugin: MainPlugin | undefined = required?.default ?? required?.mainPlugin ?? required
      if (!plugin || typeof plugin !== 'object') {
        return { ok: false, error: 'main entry must export a MainPlugin object (default or mainPlugin)' }
      }
      if (typeof plugin.name !== 'string' || typeof plugin.install !== 'function') {
        return { ok: false, error: 'invalid MainPlugin: missing name or install' }
      }

      await plugin.install(context)

      this.loaded.set(pluginName, { plugin, context, cleanupFns, registeredHandlerChannels, registeredListeners })
      logger.info('main-process plugin loaded')
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      logger.error('load failed:', error)
      await this.runCleanup(cleanupFns, pluginName)
      await this.cleanupIpc(registeredHandlerChannels, registeredListeners)
      return { ok: false, error: message }
    }
  }

  async unload(pluginName: string): Promise<{ ok: boolean; error?: string }> {
    const entry = this.loaded.get(pluginName)
    if (!entry) return { ok: true }

    try {
      if (typeof entry.plugin.uninstall === 'function') {
        await entry.plugin.uninstall(entry.context)
      }
      await this.runCleanup(entry.cleanupFns, pluginName)
      await this.cleanupIpc(entry.registeredHandlerChannels, entry.registeredListeners)
      this.loaded.delete(pluginName)
      entry.context.logger.info('main-process plugin unloaded')
      return { ok: true }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      entry.context.logger.error('unload failed:', error)
      await this.runCleanup(entry.cleanupFns, pluginName).catch(() => {})
      await this.cleanupIpc(entry.registeredHandlerChannels, entry.registeredListeners).catch(() => {})
      this.loaded.delete(pluginName)
      return { ok: false, error: message }
    }
  }

  async reload(payload: {
    pluginName: string
    pluginDir: string
    mainEntry: string
    info: Record<string, unknown>
  }): Promise<{ ok: boolean; error?: string }> {
    await this.unload(payload.pluginName).catch(() => {})
    return await this.load(payload)
  }

  private async runCleanup(cleanupFns: Array<() => void | Promise<void>>, pluginName: string): Promise<void> {
    while (cleanupFns.length > 0) {
      const fn = cleanupFns.pop()
      if (!fn) break
      try {
        await fn()
      } catch (error) {
        console.warn(`${logPrefix(pluginName)} cleanup fn failed:`, error)
      }
    }
  }

  /**
   * 解析主进程入口路径，依次尝试：
   *   1. info.json 中声明的 mainEntry 原值（绝对路径优先）
   *   2. <pluginDir>/dist/<mainEntry>（Vite 默认输出目录）
   *   3. <pluginDir>/build/<mainEntry>（备选输出目录）
   * 这样 info.json 里写 "main.js" 就能同时覆盖开发模式（dist/main.js）
   * 和安装模式（.qi 包根 main.js，由 build 把 dist/ 内容压平后产生）。
   */
  private resolveEntryPath(pluginDir: string, mainEntry: string): string | null {
    if (isAbsolute(mainEntry) && existsSync(mainEntry)) {
      return mainEntry
    }
    const candidates = [
      join(pluginDir, mainEntry),
      join(pluginDir, 'dist', mainEntry),
      join(pluginDir, 'build', mainEntry)
    ]
    for (const candidate of candidates) {
      if (existsSync(candidate)) return candidate
    }
    return null
  }

  private async cleanupIpc(
    handlerChannels: Set<string>,
    listeners: Map<string, Set<(...args: any[]) => void>>
  ): Promise<void> {
    for (const full of handlerChannels) {
      try {
        electronIpcMain.removeHandler(full)
      } catch {}
    }
    handlerChannels.clear()

    for (const [full, set] of listeners) {
      for (const handler of set) {
        try {
          electronIpcMain.removeListener(full, handler as any)
        } catch {}
      }
      set.clear()
    }
    listeners.clear()
  }
}

export const pluginMainLoader = new PluginMainLoader()
