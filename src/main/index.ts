import { app, shell, BrowserWindow, ipcMain, dialog, net, protocol } from 'electron'
import { join } from 'path'
import { setupSqliteHandlers, initSqlite } from './services/sqlite'
import { setupUpdaterHandlers } from './services/updater'
import { setupPtyHandlers } from './services/pty'
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

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    show: false,
    autoHideMenuBar: true,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false,
      allowRunningInsecureContent: true
    },
    transparent: true,
  titleBarStyle: 'hidden'
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

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.electron')

  require('@electron/remote/main').initialize()

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
    require('@electron/remote/main').enable(window.webContents)
  })

  ipcMain.on('ping', () => console.log('pong'))

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
        width: 800,
        height: 600,
        show: false,
        autoHideMenuBar: true,
        titleBarStyle: 'hidden',
        ...(process.platform === 'linux' ? { icon } : {}),
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

  ipcMain.handle('net:download', async (event, { url, destPath }) => {
    try {
      const response = await net.fetch(url)
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
      
      const buffer = await response.arrayBuffer()
      const fs = require('fs')
      fs.writeFileSync(destPath, Buffer.from(buffer))
      
      return { ok: true }
    } catch (error) {
      return { ok: false, error: (error as Error).message }
    }
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

  const mainWindow = createWindow()
  setupUpdaterHandlers(mainWindow)

  initTray(mainWindow)
})
