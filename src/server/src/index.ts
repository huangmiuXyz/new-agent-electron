import WebSocket from 'ws'
import * as pty from 'node-pty'

const wss = new WebSocket.Server({ port: 3333 })

wss.on('connection', (ws) => {
  const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash'

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 24,
    cwd: process.cwd(),
    env: process.env
  })

  ptyProcess.onData((data) => {
    ws.send(data)
  })

  ws.on('message', (msg) => {
    const text = msg.toString()

    try {
      const payload = JSON.parse(text)
      if (payload.type === 'resize') {
        ptyProcess.resize(payload.cols, payload.rows)
        return
      }
    } catch {}

    ptyProcess.write(text)
  })

  ws.on('close', () => {
    ptyProcess.kill()
  })
})
