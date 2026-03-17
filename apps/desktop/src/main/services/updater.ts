import { ipcMain, BrowserWindow } from 'electron'
import { autoUpdater } from 'electron-updater'
import { is } from '@electron-toolkit/utils'

const normalizeUpdaterErrorMessage = (error: unknown) => {
  const rawMessage = error instanceof Error ? error.message : String(error)

  if (rawMessage.includes('Cannot find latest.yml in the latest release artifacts')) {
    return [
      '检查更新失败：当前 GitHub Release 缺少 `latest.yml` 更新元数据。',
      '请确认发布版本时同时上传了 `latest.yml`、安装包和 `.blockmap` 文件，',
      '或使用 `pnpm build:win:publish` 重新发布。'
    ].join('')
  }

  return rawMessage
}

export function setupUpdaterHandlers(mainWindow: BrowserWindow) {
  if (is.dev) {
    autoUpdater.forceDevUpdateConfig = true
  }

  autoUpdater.autoDownload = false

  
  ipcMain.handle('updater:get-version', () => {
    return autoUpdater.currentVersion.version
  })

  
  ipcMain.handle('updater:check-for-updates', async () => {
    try {
      const result = await autoUpdater.checkForUpdates()
      return result
    } catch (error) {
      console.error('Check for updates error:', error)
      throw new Error(normalizeUpdaterErrorMessage(error))
    }
  })

  
  ipcMain.handle('updater:download-update', async () => {
    return await autoUpdater.downloadUpdate()
  })

  
  ipcMain.handle('updater:quit-and-install', () => {
    autoUpdater.quitAndInstall()
  })

  
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
    mainWindow.webContents.send('updater:status', {
      status: 'error',
      message: normalizeUpdaterErrorMessage(err)
    })
  })

  autoUpdater.on('download-progress', (progressObj) => {
    mainWindow.webContents.send('updater:status', { status: 'downloading', progress: progressObj })
  })

  autoUpdater.on('update-downloaded', (info) => {
    mainWindow.webContents.send('updater:status', { status: 'downloaded', info })
  })
}
