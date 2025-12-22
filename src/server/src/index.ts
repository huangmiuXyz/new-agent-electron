import WebSocket from 'ws'
import pty from 'node-pty'

const wss = new WebSocket.Server({ port: 3333 })

wss.on('connection', (ws) => {
  const shell =
    process.platform === 'win32'
      ? 'powershell.exe'
      : process.env.SHELL || 'bash'

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env
  })

  ptyProcess.onData(data => {
    ws.send(data)
  })

  ws.on('message', msg => {
    ptyProcess.write(msg.toString())
  })

  ws.on('close', () => {
    ptyProcess.kill()
  })
})
