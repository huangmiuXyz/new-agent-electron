import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join } from 'path'
import { initSqlite, setupSqliteHandlers } from './services/sqlite'
import { initTray } from './initTray'

import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import '@electron/remote/main'
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

  const mainWindow = createWindow()

  initTray(mainWindow)
})
