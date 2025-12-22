import { ChildProcess, spawn } from 'child_process'
export const ptyServices = () => {
  const path = require('path')

  let ptyProc: ChildProcess | null
  const outputHandlers: ((text: string) => void)[] = []

  function startPty() {
    if (ptyProc) return

    const backendPath = path.join(__dirname, '../backend/target/release/pty-backend')

    ptyProc = spawn(backendPath, [], {
      stdio: ['pipe', 'pipe', 'pipe']
    })

    ptyProc.stdout!.on('data', (data) => {
      const text = data.toString()
      outputHandlers.forEach((cb) => cb(text))
    })

    ptyProc.on('exit', (code) => {
      console.log('pty exited', code)
      ptyProc = null
    })
  }

  function sendInput(data) {
    if (!ptyProc) return
    ptyProc.stdin!.write(JSON.stringify({ type: 'input', data }) + '\n')
  }

  function resize(cols, rows) {
    if (!ptyProc) return
    ptyProc.stdin!.write(JSON.stringify({ type: 'resize', cols, rows }) + '\n')
  }
  function onOutput(cb: (text: string) => void) {
    outputHandlers.push(cb)
  }
  return {
    startPty,
    sendInput,
    resize,
    onOutput
  }
}
