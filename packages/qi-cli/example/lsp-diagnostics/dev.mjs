import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const require = createRequire(join(__dirname, 'package.json'))

const viteBin = (() => {
  const pkgPath = require.resolve('vite/package.json')
  const pkg = require('vite/package.json')
  const binField = pkg.bin
  const binName = typeof binField === 'string' ? binField : binField?.vite
  return join(dirname(pkgPath), binName)
})()

const procs = []

const start = (label, args) => {
  const child = spawn(process.execPath, [viteBin, ...args], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, FORCE_COLOR: '1' },
  })
  child.on('error', (err) => { console.error(`[${label}] failed:`, err); shutdown(1) })
  child.on('close', (code) => { if (code !== 0 && code !== null) shutdown(code || 1) })
  procs.push(child)
  console.log(`[${label}] started: vite ${args.join(' ')}`)
}

const shutdown = (code = 0) => {
  for (const child of procs) { try { child.kill('SIGTERM') } catch {} }
  process.exit(code)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

start('renderer', ['build', '--watch'])
start('main', ['build', '--watch', '--config', 'vite.main.config.ts'])

console.log('\nWatching renderer (dist/index.js) and main (dist/main.js)...\n')
