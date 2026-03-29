import { ipcMain, BrowserWindow, app } from 'electron'
import * as pty from 'node-pty'
import os from 'os'
import path from 'path'

const ptyProcesses: Map<string, pty.IPty> = new Map()
const ptyCwds: Map<string, string> = new Map()

export function setupPtyHandlers() {
  ipcMain.handle('pty:spawn', (event, { id, cols, rows, cwd }) => {
    const shell =
      os.platform() === 'win32'
        ? process.env.POWERSHELL_PATH || 'powershell.exe'
        : process.env.SHELL || 'bash'

    const ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: cwd || process.cwd(),
      env: process.env as any
    })

    const window = BrowserWindow.fromWebContents(event.sender)

    ptyProcess.onData((data) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send(`pty:data:${id}`, data)
      }
    })

    ptyProcess.onExit(({ exitCode, signal }) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send(`pty:exit:${id}`, { exitCode, signal })
      }
      ptyProcesses.delete(id)
      ptyCwds.delete(id)
    })

    ptyProcesses.set(id, ptyProcess)
    ptyCwds.set(id, cwd || process.cwd())
    return true
  })

  ipcMain.handle('pty:write', (_event, { id, data }) => {
    const ptyProcess = ptyProcesses.get(id)
    if (ptyProcess) {
      ptyProcess.write(data)
      return true
    }
    return false
  })

  ipcMain.handle('pty:resize', (_event, { id, cols, rows }) => {
    const ptyProcess = ptyProcesses.get(id)
    if (ptyProcess) {
      ptyProcess.resize(cols, rows)
      return true
    }
    return false
  })

  ipcMain.handle('pty:kill', (_event, id) => {
    const ptyProcess = ptyProcesses.get(id)
    if (ptyProcess) {
      try {
        ptyProcess.kill()
      } catch (e) {}
      ptyProcesses.delete(id)
      ptyCwds.delete(id)
      return true
    }
    return false
  })

  ipcMain.handle('pty:killByCwd', (_event, targetCwd: string) => {
    const normalizedTarget = path.resolve(targetCwd).toLowerCase()
    const idsToKill: string[] = []
    for (const [id, cwd] of ptyCwds) {
      if (cwd.toLowerCase().startsWith(normalizedTarget)) {
        idsToKill.push(id)
      }
    }
    for (const id of idsToKill) {
      const ptyProcess = ptyProcesses.get(id)
      if (ptyProcess) {
        try {
          ptyProcess.kill()
        } catch (e) {}
        ptyProcesses.delete(id)
      }
      ptyCwds.delete(id)
    }
    return idsToKill.length
  })

  app.on('before-quit', () => {
    for (const [_id, ptyProcess] of ptyProcesses) {
      try {
        ptyProcess.kill()
      } catch (e) {}
    }
    ptyProcesses.clear()
  })
}
