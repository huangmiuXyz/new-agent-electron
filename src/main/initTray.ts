import { app, Tray, Menu, BrowserWindow, nativeImage } from 'electron'
let tray: Tray | null = null
let isQuitting = false

export function initTray(mainWindow: BrowserWindow): void {
  const trayIcon = nativeImage.createEmpty()
  tray = new Tray(trayIcon)
  tray.setToolTip('AI助手')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '显示主窗口',
      click: () => {
        showWindow(mainWindow)
      }
    },
    {
      label: '隐藏主窗口',
      click: () => {
        if (mainWindow) {
          mainWindow.hide()
        }
      }
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
    toggleWindow(mainWindow)
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting && !mainWindow.isDestroyed()) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  app.on('before-quit', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.hide()
      }
    }
  })

  app.on('window-all-closed', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.hide()
    }
  })

  app.on('activate', function () {
    const windows = BrowserWindow.getAllWindows()
    if (windows.length > 0) {
      const activeWindow = windows[0]
      if (activeWindow.isMinimized()) {
        activeWindow.restore()
      }
      activeWindow.show()
      activeWindow.focus()
    }
  })
}

function showWindow(mainWindow: BrowserWindow): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) {
      mainWindow.restore()
    }
    mainWindow.show()
    mainWindow.focus()
  }
}

function toggleWindow(mainWindow: BrowserWindow): void {
  if (mainWindow) {
    if (mainWindow.isVisible() && !mainWindow.isMinimized()) {
      mainWindow.hide()
    } else {
      showWindow(mainWindow)
    }
  }
}

export function destroyTray(): void {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
