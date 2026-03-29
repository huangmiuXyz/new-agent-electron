import { app, shell, BrowserWindow, ipcMain, dialog, net, protocol, nativeTheme } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { pathToFileURL } from 'url'
import { setupSqliteHandlers, initSqlite } from './services/sqlite'
import { setupUpdaterHandlers } from './services/updater'
import { setupPtyHandlers } from './services/pty'
import { setupComputerHandlers } from './services/computer'
import { setupSearchReplaceHandlers } from './services/searchReplace'
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

const WINDOWS_TITLE_BAR_HEIGHT = 30
const WINDOWS_SYMBOL_COLOR_DARK = '#f5f5f7'
const WINDOWS_SYMBOL_COLOR_LIGHT = '#1d1d1f'
const WINDOW_SHOW_FALLBACK_DELAY = 3000

let mainWindow: BrowserWindow | null = null
interface SystemPreferences {
  openAtLogin: boolean
}

const DEFAULT_SYSTEM_PREFERENCES: SystemPreferences = {
  openAtLogin: false
}

function getSystemPreferencesPath() {
  try {
    return join(app.getPath('userData'), 'system-preferences.json')
  } catch {
    return join(process.cwd(), '.agent-qi-system-preferences.json')
  }
}

function readSystemPreferences(): SystemPreferences {
  try {
    const filePath = getSystemPreferencesPath()
    if (!existsSync(filePath)) {
      return { ...DEFAULT_SYSTEM_PREFERENCES }
    }

    const raw = JSON.parse(readFileSync(filePath, 'utf-8')) as Partial<SystemPreferences>
    return {
      openAtLogin: Boolean(raw.openAtLogin)
    }
  } catch (error) {
    console.warn('[main] Failed to read system preferences', error)
    return { ...DEFAULT_SYSTEM_PREFERENCES }
  }
}

function writeSystemPreferences(next: Partial<SystemPreferences>) {
  const filePath = getSystemPreferencesPath()
  const preferences = {
    ...readSystemPreferences(),
    ...next
  }

  mkdirSync(dirname(filePath), { recursive: true })
  writeFileSync(filePath, JSON.stringify(preferences, null, 2), 'utf-8')
  return preferences
}

function isOpenAtLoginSupported() {
  return process.platform === 'darwin' || process.platform === 'win32'
}

function applyOpenAtLoginSetting(enabled: boolean) {
  if (!isOpenAtLoginSupported()) {
    return false
  }

  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: false,
    ...(process.platform === 'win32' && process.defaultApp
      ? {
        path: process.execPath,
        args: [app.getAppPath()]
      }
      : {})
  })

  return true
}

function getSystemSettingsSnapshot() {
  const preferences = readSystemPreferences()
  const loginItemSettings = isOpenAtLoginSupported()
    ? app.getLoginItemSettings()
    : { openAtLogin: preferences.openAtLogin }

  return {
    openAtLogin: Boolean(loginItemSettings.openAtLogin),
    openAtLoginSupported: isOpenAtLoginSupported()
  }
}

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
    const url = new URL(request.url)
    let filePath = decodeURIComponent(url.pathname)

    // Support Windows drive-letter paths for both:
    // - plugin-resource:///C:/Users/...
    // - legacy plugin-resource://C/Users/... (host becomes the drive letter)
    if (process.platform === 'win32' && url.host && /^[a-z]$/i.test(url.host)) {
      filePath = `/${url.host.toUpperCase()}:${filePath}`
    }

    // pathToFileURL('C:/...') is correct on Windows, but pathToFileURL('/C:/...')
    // is treated as a relative path and becomes file:///E:/C:/... on the current drive.
    if (process.platform === 'win32' && /^\/[a-z]:\//i.test(filePath)) {
      filePath = filePath.slice(1)
    }

    return net.fetch(pathToFileURL(filePath).toString())
  })

  const fallbackShowTimer = setTimeout(() => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn('[main] Window was not ready-to-show in time, forcing show()')
      mainWindow.maximize()
      mainWindow.show()
    }
  }, WINDOW_SHOW_FALLBACK_DELAY)

  mainWindow.on('ready-to-show', () => {
    clearTimeout(fallbackShowTimer)
    mainWindow.maximize()
    mainWindow.show()
  })

  mainWindow.on('closed', () => {
    clearTimeout(fallbackShowTimer)
  })

  mainWindow.on('unresponsive', () => {
    console.error('[main] Main window became unresponsive')
  })

  mainWindow.webContents.on(
    'did-fail-load',
    (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      console.error('[main] did-fail-load', {
        errorCode,
        errorDescription,
        validatedURL,
        isMainFrame
      })
    }
  )

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[main] render-process-gone', details)
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']).catch((error) => {
      console.error('[main] Failed to load renderer URL', error)
    })
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html')).catch((error) => {
      console.error('[main] Failed to load renderer HTML', error)
    })
  }

  return mainWindow
}

app.commandLine.appendSwitch('no-sandbox')

const gotSingleInstanceLock = app.requestSingleInstanceLock()

if (!gotSingleInstanceLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
})

if (gotSingleInstanceLock) {
  app.whenReady().then(() => {
    electronApp.setAppUserModelId('com.electron.app')

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

  ipcMain.handle('system:get-settings', () => {
    return getSystemSettingsSnapshot()
  })

  ipcMain.handle('system:set-open-at-login', (_event, enabled: boolean) => {
    const applied = applyOpenAtLoginSetting(Boolean(enabled))
    const openAtLogin = applied ? Boolean(enabled) : false
    writeSystemPreferences({ openAtLogin })
    return getSystemSettingsSnapshot()
  })

    applyOpenAtLoginSetting(readSystemPreferences().openAtLogin)

    mainWindow = createWindow()
    setupUpdaterHandlers(mainWindow)
    initTray(mainWindow)

    try {
      initSqlite()
      setupSqliteHandlers()
    } catch (error) {
      console.error('[main] Failed to initialize sqlite services', error)
    }

    setupPtyHandlers()
    setupComputerHandlers()
    setupSearchReplaceHandlers()
    setupSyncHandlers()
  })
}
