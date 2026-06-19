import type { MainPlugin, MainPluginContext } from '@agent-qi/types'
import type { BrowserWindow } from 'electron'

let win: BrowserWindow | null = null
/** 缓存最近一次推送的数据，新窗口 ready 后回放，避免打开瞬间空白 */
let lastData: Record<string, unknown> | null = null
let isWindowReady = false

const mainPlugin: MainPlugin = {
  name: 'opencode-usage-monitor',
  version: '1.0.0',
  description: 'OpenCode usage monitor main-process window',

  install: (ctx: MainPluginContext) => {
    const { BrowserWindow } = ctx.electron

    const ensureWindow = (): Promise<BrowserWindow> => {
      if (win && !win.isDestroyed()) return Promise.resolve(win)
      isWindowReady = false
      win = new BrowserWindow({
        width: 1280,
        height: 980,
        title: 'OpenCode Go 用量',
        backgroundColor: '#1a1a1a',
        autoHideMenuBar: true,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true
        }
      })

      const readyPromise = new Promise<void>((resolve) => {
        win!.webContents.once('did-finish-load', () => {
          isWindowReady = true
          resolve()
        })
        win!.webContents.once('dom-ready', () => {
          isWindowReady = true
          resolve()
        })
      })

      void win.loadURL('https://opencode.ai/zen')

      win.on('closed', () => {
        win = null
        isWindowReady = false
      })

      return readyPromise.then(() => win as BrowserWindow)
    }

    ctx.ipc.handle('show-window', async () => {
      const w = await ensureWindow()
      w.show()
      w.focus()
      return { ok: true }
    })

    ctx.ipc.handle('hide-window', () => {
      if (win && !win.isDestroyed()) win.hide()
      return { ok: true }
    })

    ctx.onUnload(() => {
      if (win && !win.isDestroyed()) {
        win.destroy()
      }
      win = null
      isWindowReady = false
      lastData = null
    })

    ctx.logger.info('main-process window plugin installed')
  },

  uninstall: (ctx: MainPluginContext) => {
    if (win && !win.isDestroyed()) {
      win.destroy()
    }
    win = null
    isWindowReady = false
    lastData = null
    ctx.logger.info('main-process window plugin uninstalled')
  }
}

export default mainPlugin
