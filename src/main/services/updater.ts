import { ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'

export function setupUpdaterHandlers(mainWindow: BrowserWindow) {
  if (is.dev) {
    autoUpdater.forceDevUpdateConfig = true
  }

  autoUpdater.autoDownload = false

  // 获取当前版本
  ipcMain.handle('updater:get-version', () => {
    return autoUpdater.currentVersion.version
  })

  // 检查更新
  ipcMain.handle('updater:check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return result
    } catch (error) {
      console.error('Check for updates error:', error)
      throw error
    }
  })

  // 开始下载更新
  ipcMain.handle('updater:download-update', async () => {
    return await autoUpdater.downloadUpdate()
  })

  // 退出并安装
  ipcMain.handle('updater:quit-and-install', () => {
    autoUpdater.quitAndInstall()
  })

  // 监听更新事件并发送到渲染进程
  autoUpdater.on('checking-for-update', () => {
    mainWindow.webContents.send('updater:status', { status: 'checking' })
  })

  autoUpdater.on('update-available', (info) => {
    mainWindow.webContents.send('updater:status', { status: 'available', info })
  })

  autoUpdater.on('update-not-available', (info) => {
    mainWindow.webContents.send('updater:status', { status: 'not-available', info })
  })

  autoUpdater.on('error', (err) => {
    mainWindow.webContents.send('updater:status', { status: 'error', message: err.message })
  })

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('updater:status', { status: 'downloading', progress: progressObj })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('updater:status', { status: 'downloaded', info })
  })
}
