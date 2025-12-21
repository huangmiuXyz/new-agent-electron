import express from 'express'
import http from 'node:http'
import { WebSocketServer, WebSocket } from 'ws'
import pty from 'node-pty'
import crypto from 'node:crypto'

const app = express()
const server = http.createServer(app)
const wss = new WebSocketServer({ server })

const PORT = 3000

const terminals = new Map<string, pty.IPty>()

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

function createTerminal() {
  const id = crypto.randomUUID()

  const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || 'bash'

  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-color',
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env
  })

  terminals.set(id, ptyProcess)

  ptyProcess.onExit(() => {
    terminals.delete(id)
  })

  return { id, ptyProcess }
}

wss.on('connection', (ws: WebSocket) => {
  ws.on('message', (raw) => {
    let msg: any
    try {
      msg = JSON.parse(raw.toString())
    } catch {
      return
    }

    const { type, terminalId, data, cols, rows } = msg

    if (type === 'create') {
      const { id, ptyProcess } = createTerminal()

      ptyProcess.onData((output) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              type: 'output',
              terminalId: id,
              data: output
            })
          )
        }
      })

      ws.send(
        JSON.stringify({
          type: 'created',
          terminalId: id
        })
      )

      return
    }

    if (type === 'input' && terminals.has(terminalId)) {
      terminals.get(terminalId)!.write(data)
      return
    }

    if (
      type === 'resize' &&
      terminals.has(terminalId) &&
      Number.isInteger(cols) &&
      Number.isInteger(rows)
    ) {
      terminals.get(terminalId)!.resize(cols, rows)
      return
    }

    if (type === 'close' && terminals.has(terminalId)) {
      terminals.get(terminalId)!.kill()
      terminals.delete(terminalId)
    }
  })
})

server.listen(PORT, () => {
  console.log(`server listening on :${PORT}`)
})
