import WebSocket from 'ws'
import * as pty from 'node-pty'
import os from 'os'

const wss = new WebSocket.Server({ port: 3333 })

wss.on('connection', (ws) => {
  const shell = os.platform() === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash'

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env
  })

  ptyProcess.onData((data) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(data)
    }
  })

  ws.on('message', (msg) => {
    const text = msg.toString()
    try {
      if (text.startsWith('{')) {
        const payload = JSON.parse(text)
        if (payload.type === 'resize') {
          ptyProcess.resize(payload.cols, payload.rows)
          return
        }
      }
    } catch (e) {}
    ptyProcess.write(text)
  })
  const cleanup = () => {
    try {
      ptyProcess.kill()
    } catch (e) {}
  }

  ws.on('close', cleanup)
  ws.on('error', cleanup)
})

console.log('PTY Server started on port 3333')
