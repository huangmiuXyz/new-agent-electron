import { app, shell, BrowserWindow, ipcMain, dialog, net, protocol, nativeTheme } from 'electron'
import { join } from 'path'
import { setupSqliteHandlers, initSqlite } from './services/sqlite'
import { setupUpdaterHandlers } from './services/updater'
import { setupPtyHandlers } from './services/pty'
import { setupComputerHandlers } from './services/computer'
import { setupBrowserHandlers } from './services/browser'
import { setupSyncHandlers } from './services/sync'
import { initTray } from './initTray'

import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import '@electron/remote/main'

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'plugin-resource',
    privileges: {
      secure: true,
      standard: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
])

const WINDOWS_TITLE_BAR_HEIGHT = 40
const WINDOWS_SYMBOL_COLOR_DARK = '#f5f5f7'
const WINDOWS_SYMBOL_COLOR_LIGHT = '#1d1d1f'

function getWindowsTitleBarOverlay(isDark: boolean) {
  return {
    color: '#00000000',
    symbolColor: isDark ? WINDOWS_SYMBOL_COLOR_DARK : WINDOWS_SYMBOL_COLOR_LIGHT,
    height: WINDOWS_TITLE_BAR_HEIGHT
  }
}

function createWindow(): BrowserWindow {
  const isMac = process.platform === 'darwin'
  const isWindows = process.platform === 'win32'
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'darwin' ? {} : { icon }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    },
    transparent: isMac,
    titleBarStyle: isMac || isWindows ? 'hidden' : 'default',
    ...(isWindows
      ? {
        titleBarOverlay: getWindowsTitleBarOverlay(nativeTheme.shouldUseDarkColors)
      }
      : {})
  })

  protocol.handle('plugin-resource', (request) => {
    const url = request.url.replace('plugin-resource://', '')
    const decodedPath = decodeURIComponent(url)
    const filePath = decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`
    return net.fetch(`file://${filePath}`)
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

app.commandLine.appendSwitch('no-sandbox')
app.commandLine.appendSwitch('disable-gpu')

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  require('@electron/remote/main').initialize()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
    require('@electron/remote/main').enable(window.webContents)
  })


  ipcMain.handle('dialog:showOpenDialog', async (_event, options) => {
    const result = await dialog.showOpenDialog(options)
    return result
  })
  ipcMain.handle(
    'window:create-temp-chat',
    async (_event, { model, agentId, agent, history, autoReply }) => {
      const windowId = Math.random().toString(36).substring(7)
      global.tempChatData = global.tempChatData || {}
      global.tempChatData[windowId] = { model, agentId, agent, history, autoReply }

      const win = new BrowserWindow({
        ...(process.platform === 'darwin'
          ? {
            transparent: true,
            titleBarStyle: 'hidden' as const
          }
          : process.platform === 'win32'
            ? {
              transparent: false,
              titleBarStyle: 'hidden' as const,
              titleBarOverlay: getWindowsTitleBarOverlay(nativeTheme.shouldUseDarkColors)
            }
          : {
            transparent: false,
            titleBarStyle: 'default' as const
          }),
        width: 800,
        height: 600,
        show: false,
        autoHideMenuBar: true,
        ...(process.platform === 'darwin' ? {} : { icon }),
        webPreferences: {
          preload: join(__dirname, '../preload/index.js'),
          sandbox: false,
          webSecurity: false
        }
      })

      win.on('ready-to-show', () => {
        win.show()
      })

      win.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url)
        return { action: 'deny' }
      })

      if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/temp-chat?windowId=${windowId}`)
      } else {
        win.loadFile(join(__dirname, '../renderer/index.html'), {
          hash: `/temp-chat?windowId=${windowId}`
        })
      }
      return windowId
    }
  )

  ipcMain.handle('window:set-title-bar-theme', (event, isDarkMode: boolean) => {
    if (process.platform !== 'win32') return false
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return false
    win.setTitleBarOverlay(getWindowsTitleBarOverlay(Boolean(isDarkMode)))
    return true
  })

  ipcMain.handle('net:fetch', async (_event, url, options) => {
    try {
      const response = await net.fetch(url, options)
      const text = await response.text()
      return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: Object.fromEntries(response.headers.entries()),
        text
      }
    } catch (error) {
      return {
        ok: false,
        error: (error as Error).message
      }
    }
  })

  const downloadControllers = new Map<string, AbortController>()

  ipcMain.handle('net:download', async (event, { url, destPath, id, offset = 0 }) => {
    const controller = new AbortController()
    if (id) {
      if (downloadControllers.has(id)) {
        downloadControllers.get(id)?.abort()
      }
      downloadControllers.set(id, controller)
    }

    try {
      const { fetch } = require('electron').net
      const headers: Record<string, string> = {}
      if (offset > 0) {
        headers['Range'] = `bytes=${offset}-`
      }

      const response = await fetch(url, {
        signal: controller.signal as any,
        headers
      })

      if (offset > 0 && response.status === 416) {
        return { ok: true, alreadyComplete: true }
      }

      if (!response.ok && response.status !== 206) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      const canResume = offset > 0 && response.status === 206
      const resumeOffset = canResume ? offset : 0
      const contentLength = parseInt(response.headers.get('content-length') || '0')
      const totalBytes = resumeOffset > 0 ? resumeOffset + contentLength : contentLength
      let downloadedBytes = resumeOffset

      const reader = (response.body as any).getReader()
      const fs = require('fs')
      const fileStream = fs.createWriteStream(destPath, { flags: canResume ? 'a' : 'w' })

      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break

          downloadedBytes += value.length
          fileStream.write(Buffer.from(value))

          if (id) {
            const progress = {
              total: totalBytes,
              downloaded: downloadedBytes,
              percent: totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 0
            }
            event.sender.send(`net:download-progress:${id}`, progress)
          }
        }
      } catch (err: any) {
        throw err
      } finally {
        await new Promise<void>((resolve) => fileStream.end(() => resolve()))
        if (id) downloadControllers.delete(id)
      }

      if (id) {
        const progress = {
          total: totalBytes,
          downloaded: downloadedBytes,
          percent: totalBytes ? Math.round((downloadedBytes / totalBytes) * 100) : 100
        }
        event.sender.send(`net:download-progress:${id}`, progress)
      }

      return { ok: true }
    } catch (error) {
      if (id) downloadControllers.delete(id)
      const err = error as Error
      const message = err?.message || String(error)
      const aborted = err?.name === 'AbortError' || message.toLowerCase().includes('abort')
      return { ok: false, error: message, aborted }
    }
  })

  ipcMain.handle('net:cancel-download', async (_event, id) => {
    if (id && downloadControllers.has(id)) {
      downloadControllers.get(id)?.abort()
      downloadControllers.delete(id)
      return true
    }
    return false
  })

  ipcMain.handle('window:get-temp-chat-data', async (_event, windowId) => {
    if (global.tempChatData && global.tempChatData[windowId]) {
      const data = global.tempChatData[windowId]
      delete global.tempChatData[windowId]
      return data
    }
    return null
  })

  initSqlite()
  setupSqliteHandlers()
  setupPtyHandlers()
  setupComputerHandlers()
  setupBrowserHandlers()
  setupSyncHandlers()

  const mainWindow = createWindow()
  setupUpdaterHandlers(mainWindow)

  initTray(mainWindow)
})
