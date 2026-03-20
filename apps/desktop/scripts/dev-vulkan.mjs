import { spawn } from 'node:child_process'

const command = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
const child = spawn(command, ['exec', 'electron-vite', 'dev', '--', '--remote-debugging-port=9222'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    AGENT_QI_VULKAN: 'on'
  }
})

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal)
    return
  }

  process.exit(code ?? 0)
})

child.on('error', (error) => {
  console.error('[dev:vulkan] Failed to start electron-vite', error)
  process.exit(1)
})
