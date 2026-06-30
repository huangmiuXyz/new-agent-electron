import { app, Tray, Menu, BrowserWindow, nativeImage } from 'electron'
import trayIconPath from '../../resources/Q.png?asset'

let tray: Tray | null = null
let isQuitting = false

export function initTray(mainWindow: BrowserWindow): void {
  const trayIcon = nativeImage.createFromPath(trayIconPath)

  if (trayIcon.isEmpty()) {
    console.error('Tray icon image is invalid at path:', trayIconPath)
    return
  }

  tray = new Tray(trayIcon)

  tray.setToolTip('AI助手')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => showWindow(mainWindow)
    },
    {
      label: '隐藏主窗口',
      click: () => hideWindow(mainWindow)
    },
    { type: 'separator' },
    {
      label: '退出应用',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    toggleWindow(mainWindow)
  })

  app.on('before-quit', () => {
    isQuitting = true
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      hideWindow(mainWindow)
    }
  })

  app.on('window-all-closed', () => {})

  app.on('activate', () => {
    showWindow(mainWindow)
  })
}

function hideWindow(mainWindow: BrowserWindow): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  mainWindow.hide()

  if (process.platform === 'darwin') {
    app.hide()
    app.dock?.hide()
  }
}

function showWindow(mainWindow: BrowserWindow): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (process.platform === 'darwin') {
    app.show()
    app.dock?.show()
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore()
  }

  mainWindow.show()
  mainWindow.focus()
}

function toggleWindow(mainWindow: BrowserWindow): void {
  if (!mainWindow || mainWindow.isDestroyed()) return

  if (mainWindow.isVisible()) {
    hideWindow(mainWindow)
  } else {
    showWindow(mainWindow)
  }
}

export function destroyTray(): void {
  tray?.destroy()
  tray = null
}
