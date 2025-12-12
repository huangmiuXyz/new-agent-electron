import os from 'os'
import pty from 'node-pty'
export const ptyServices = () => {
  const shell = os.platform() === 'win32' ? 'powershell.exe' : 'bash'
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME || process.env.USERPROFILE,
    env: process.env
  })

  return {
    onTerminalData: (callback: (data: string) => void) => {
      ptyProcess.onData(callback)
    },
    writeToTerminal: (data: string) => {
      ptyProcess.write(data)
    },
    resizeTerminal: (cols: number, rows: number) => {
      ptyProcess.resize(cols, rows)
    },
    onTerminalExit: (callback: () => void) => {
      ptyProcess.onExit(callback)
    }
  }
}
