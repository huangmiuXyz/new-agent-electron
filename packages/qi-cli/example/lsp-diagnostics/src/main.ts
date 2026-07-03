import type { MainPlugin, MainPluginContext } from '@agent-qi/types'
import { createMainBridge, type DiagnosticEntry, type ServerStatusInfo } from './protocol'
import { findServerById, resolveBinary, type ServerConfig, type Installer } from './server-config'
import { LANGUAGE_EXTENSIONS } from './language'
import path from 'path'
import fs from 'fs'
import { spawn, execSync } from 'child_process'
import https from 'https'
import { createWriteStream, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'

const PLUGIN_NAME = 'lsp-diagnostics'
const INITIALIZE_TIMEOUT_MS = 45_000
const INSTALL_TIMEOUT_MS = 120_000

interface ServerHandle {
  process: import('child_process').ChildProcessWithoutNullStreams
  connection: ReturnType<typeof createMessageConnection>
  root: string
  config: ServerConfig
  files: Record<string, { version: number }>
  diagnostics: Record<string, DiagnosticEntry[]>
  diagnosticPullRegistered?: boolean
  connectedAt: number
  triggerFilePath: string
}

type ServerState = {
  clients: Map<string, ServerHandle>
  broken: Set<string>
}

function getFilePath(uri: string): string | undefined {
  if (!uri.startsWith('file://')) return
  let p = decodeURIComponent(uri.slice(7))
  if (process.platform === 'win32') {
    if (p.startsWith('/')) p = p.slice(1)
    if (/^[a-z]:/.test(p)) p = p[0].toUpperCase() + p.slice(1)
  }
  return path.normalize(p)
}

function pathToFileURL(p: string): string {
  if (process.platform === 'win32') {
    p = p.replace(/\\/g, '/')
    if (!p.startsWith('/')) p = '/' + p
  }
  return 'file://' + p
}

const severityMap: Record<number, 1 | 2 | 3 | 4> = { 1: 1, 2: 2, 3: 3, 4: 4 }

function parseDiagnostics(uri: string, items: any[]): Record<string, DiagnosticEntry[]> {
  const result: Record<string, DiagnosticEntry[]> = {}
  const filePath = getFilePath(uri)
  if (!filePath || !Array.isArray(items)) return result
  result[filePath] = items.map((item: any) => ({
    severity: severityMap[item.severity] ?? 1,
    message: item.message || '',
    line: (item.range?.start?.line ?? 0) + 1,
    column: (item.range?.start?.character ?? 0) + 1,
    source: item.source,
    code: item.code,
  }))
  return result
}

function dedupeDiagnostics(items: DiagnosticEntry[]): DiagnosticEntry[] {
  const seen = new Set<string>()
  return items.filter((item) => {
    const key = JSON.stringify([item.line, item.column, item.message, item.code])
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function httpGetJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'agent-qi-lsp-diagnostics' } }, (res) => {
      let data = ''
      res.on('data', (chunk: string) => data += chunk)
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { reject(new Error('Invalid JSON')) } })
    }).on('error', reject)
  })
}

function httpDownload(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest)
    https.get(url, (res) => {
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', (err) => { file.close(); reject(err) })
  })
}

function extractZip(zipPath: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      execSync(`tar -xf "${zipPath}" -C "${dest}"`, { timeout: 60000, stdio: 'pipe' })
      resolve()
    } catch {
      try {
        const AdmZip = require('adm-zip') as any
        const zip = new AdmZip(zipPath)
        zip.extractAllTo(dest, true)
        resolve()
      } catch {
        reject(new Error('Failed to extract zip'))
      }
    }
  })
}

const platformMap: Record<string, string> = { darwin: 'macos', linux: 'linux', win32: 'windows' }
const archMap: Record<string, string> = { x64: 'x86_64', arm64: 'aarch64', ia32: 'x86' }
const extMap: Record<string, string> = { darwin: 'tar.xz', linux: 'tar.xz', win32: 'zip' }

async function installGithubRelease(installer: Installer & { type: 'github-release' }): Promise<boolean> {
  try {
    const platform = platformMap[process.platform] || process.platform
    const arch = archMap[process.arch] || process.arch
    const ext = extMap[process.platform] || 'tar.gz'

    const release: any = await httpGetJson(`https://api.github.com/repos/${installer.repo}/releases/latest`)
    const tag = (release.tag_name || '').replace(/^v/, '')
    if (!tag) return false

    const assetName = installer.asset
      .replace('{arch}', arch)
      .replace('{platform}', platform)
      .replace('{ext}', ext)
      .replace('{version}', tag)
      .replace('{tag}', release.tag_name || tag)

    const asset = release.assets?.find((a: any) => a.name === assetName)
    if (!asset?.browser_download_url) return false

    const tmp = path.join(tmpdir(), `lsp-install-${installer.repo.replace('/', '-')}`)
    mkdirSync(tmp, { recursive: true })
    const archivePath = path.join(tmp, assetName)

    await httpDownload(asset.browser_download_url, archivePath)

    const targetDir = path.join(tmp, 'extracted')
    mkdirSync(targetDir, { recursive: true })

    if (ext === 'zip') {
      await extractZip(archivePath, targetDir)
    } else {
      execSync(`tar -xf "${archivePath}" -C "${targetDir}"`, { timeout: 60000, stdio: 'pipe' })
    }

    const binName = installer.bin + (process.platform === 'win32' ? '.exe' : '')
    const found = findFile(targetDir, binName)
    if (!found) return false

    const installDir = path.join(process.env.HOME || process.env.USERPROFILE || tmpdir(), '.lsp-bin')
    mkdirSync(installDir, { recursive: true })
    const dest = path.join(installDir, binName)
    fs.copyFileSync(found, dest)
    try { fs.chmodSync(dest, 0o755) } catch {}

    const pathEnv = process.env.PATH || ''
    if (!pathEnv.includes(installDir)) {
      process.env.PATH = `${installDir}${path.delimiter}${pathEnv}`
    }

    fs.rmSync(tmp, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
}

function findFile(dir: string, name: string): string | undefined {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const full = path.join(dir, entry.name)
    if (entry.isFile() && (entry.name === name || entry.name.endsWith('/' + name) || entry.name.endsWith('\\' + name))) return full
    if (entry.isDirectory()) {
      const found = findFile(full, name)
      if (found) return found
    }
  }
  return undefined
}

function getLspBinDir(): string {
  const dir = path.join(process.env.HOME || process.env.USERPROFILE || tmpdir(), '.lsp-bin')
  mkdirSync(dir, { recursive: true })
  if (!(process.env.PATH || '').includes(dir)) {
    process.env.PATH = `${dir}${path.delimiter}${process.env.PATH || ''}`
  }
  return dir
}

async function installDownloadZip(installer: Installer & { type: 'download-zip' }, serverId: string): Promise<boolean> {
  try {
    const lspBin = getLspBinDir()
    const targetDir = path.join(lspBin, serverId)
    mkdirSync(targetDir, { recursive: true })

    const zipPath = path.join(tmpdir(), `${serverId}-install.zip`)
    await httpDownload(installer.url, zipPath)
    await extractZip(zipPath, targetDir)

    const extractedDir = path.join(targetDir, path.basename(installer.extractDir))
    if (fs.existsSync(path.join(targetDir, 'server')) || fs.existsSync(path.join(targetDir, 'release'))) {
      // already flat, use targetDir directly
    } else {
      // find the first directory
      const entries = fs.readdirSync(targetDir).filter(e => fs.statSync(path.join(targetDir, e)).isDirectory())
      if (entries.length > 0) {
        const subDir = path.join(targetDir, entries[0])
        const subFiles = fs.readdirSync(subDir)
        for (const f of subFiles) {
          fs.renameSync(path.join(subDir, f), path.join(targetDir, f))
        }
        fs.rmdirSync(subDir)
      }
    }

    if (installer.build) {
      for (const cmd of installer.build) {
        execSync(cmd, { cwd: targetDir, timeout: INSTALL_TIMEOUT_MS, stdio: 'pipe', env: { ...process.env, MIX_ENV: 'prod' } })
      }
    }

    const serverFullPath = path.join(targetDir, installer.serverPath)
    const binPath = path.join(lspBin, serverId + (process.platform === 'win32' ? '.cmd' : ''))
    const escapedPath = serverFullPath.replace(/\\/g, '/').replace(/ /g, '\\ ')

    if (serverId === 'eslint') {
      const nodeBin = process.platform === 'win32' ? 'node.exe' : 'node'
      fs.writeFileSync(binPath, `#!/usr/bin/env sh\n${nodeBin} "${serverFullPath}" "$@"\n`, 'utf-8')
      try { fs.chmodSync(binPath, 0o755) } catch {}
    } else if (serverId === 'elixir-ls') {
      try { fs.chmodSync(serverFullPath, 0o755) } catch {}
      const wrapperPath = path.join(lspBin, 'elixir-ls')
      fs.writeFileSync(wrapperPath, `#!/usr/bin/env sh\n"${serverFullPath}" "$@"\n`, 'utf-8')
      try { fs.chmodSync(wrapperPath, 0o755) } catch {}
    }

    fs.rmSync(zipPath, { force: true })
    return true
  } catch {
    return false
  }
}

async function installDownloadTar(installer: Installer & { type: 'download-tar' }, serverId: string): Promise<boolean> {
  try {
    const lspBin = getLspBinDir()
    const targetDir = path.join(lspBin, serverId)
    mkdirSync(targetDir, { recursive: true })

    const tarPath = path.join(tmpdir(), `${serverId}-install.tar.gz`)
    await httpDownload(installer.url, tarPath)
    execSync(`tar -xzf "${tarPath}" -C "${targetDir}"`, { timeout: 60000, stdio: 'pipe' })
    fs.rmSync(tarPath, { force: true })

    const entries = fs.readdirSync(targetDir).filter(e => fs.statSync(path.join(targetDir, e)).isDirectory())
    if (entries.length > 0) {
      const subDir = path.join(targetDir, entries[0])
      const subFiles = fs.readdirSync(subDir)
      for (const f of subFiles) {
        const src = path.join(subDir, f)
        const dst = path.join(targetDir, f)
        if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true })
        fs.renameSync(src, dst)
      }
      fs.rmdirSync(subDir)
    }

    return true
  } catch {
    return false
  }
}

export async function tryInstall(installer: Installer, serverId: string): Promise<boolean> {
  try {
    switch (installer.type) {
      case 'npm': {
        const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
        execSync(`${npm} install -g ${installer.package}`, { timeout: INSTALL_TIMEOUT_MS, stdio: 'pipe' })
        return true
      }
      case 'go-install': {
        const go = process.platform === 'win32' ? 'go.exe' : 'go'
        execSync(`${go} install ${installer.module}`, { timeout: INSTALL_TIMEOUT_MS, stdio: 'pipe', env: { ...process.env } })
        return true
      }
      case 'gem-install': {
        const gem = process.platform === 'win32' ? 'gem.cmd' : 'gem'
        execSync(`${gem} install ${installer.gem}`, { timeout: INSTALL_TIMEOUT_MS, stdio: 'pipe' })
        return true
      }
      case 'dotnet-tool': {
        const dotnet = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet'
        execSync(`${dotnet} tool install --global ${installer.tool}`, { timeout: INSTALL_TIMEOUT_MS, stdio: 'pipe' })
        return true
      }
      case 'pip': {
        const pip = process.platform === 'win32' ? 'pip.exe' : 'pip3'
        execSync(`${pip} install ${installer.package}`, { timeout: INSTALL_TIMEOUT_MS, stdio: 'pipe' })
        return true
      }
      case 'pip-npm': {
        try {
          const pip = process.platform === 'win32' ? 'pip.exe' : 'pip3'
          execSync(`${pip} install ${installer.package}`, { timeout: INSTALL_TIMEOUT_MS, stdio: 'pipe' })
          return true
        } catch {
          const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
          execSync(`${npm} install -g ${installer.package}`, { timeout: INSTALL_TIMEOUT_MS, stdio: 'pipe' })
          return true
        }
      }
      case 'github-release': {
        return installGithubRelease(installer)
      }
      case 'rustup': {
        execSync(`rustup component add ${installer.component}`, { timeout: INSTALL_TIMEOUT_MS, stdio: 'pipe' })
        return true
      }
      case 'download-zip': {
        return installDownloadZip(installer, serverId || 'download')
      }
      case 'download-tar': {
        return installDownloadTar(installer, serverId || 'download')
      }
    }
  } catch {
    return false
  }
  return false
}

export async function resolveServer(config: ServerConfig, directory: string): Promise<{ binary: string; args: string[]; initialization?: Record<string, any> } | undefined> {
  let found = await resolveBinary(config, directory)

  if (!found && config.installers) {
    for (const installer of config.installers) {
      const ok = await tryInstall(installer, config.id)
      if (ok) {
        found = await resolveBinary(config, directory)
        if (found) break
      }
    }
  }

  if (!found) return undefined

  if (config.id === 'jdtls') {
    const lspBin = path.join(process.env.HOME || process.env.USERPROFILE || tmpdir(), '.lsp-bin', 'jdtls')
    const pluginsDir = path.join(lspBin, 'plugins')
    let launcherJar = ''
    if (fs.existsSync(pluginsDir)) {
      const jars = fs.readdirSync(pluginsDir).filter(f => /^org\.eclipse\.equinox\.launcher_.*\.jar$/.test(f))
      if (jars.length > 0) launcherJar = path.join(pluginsDir, jars[0])
    }
    if (launcherJar) {
      const configDir = path.join(lspBin, `config_${process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'win' : 'linux'}`)
      const dataDir = path.join(tmpdir(), `jdtls-data-${Date.now()}`)
      mkdirSync(dataDir, { recursive: true })
      return {
        binary: found,
        args: [
          '-jar', launcherJar,
          '-configuration', configDir,
          '-data', dataDir,
          '-Declipse.application=org.eclipse.jdt.ls.core.id1',
          '-Dosgi.bundles.defaultStartLevel=4',
          '-Declipse.product=org.eclipse.jdt.ls.core.product',
          '-Dlog.level=ALL',
          '--add-modules=ALL-SYSTEM',
          '--add-opens', 'java.base/java.util=ALL-UNNAMED',
          '--add-opens', 'java.base/java.lang=ALL-UNNAMED',
        ],
        initialization: config.initialization,
      }
    }
  }

  if (config.installOverrides) {
    const overrides = config.installOverrides
    const serverPath = found // the resolved binary path might be a launcher script
    const resolvedArgs = overrides.args?.map(a => a.replace('{serverPath}', serverPath)) ?? config.args
    return {
      binary: overrides.binary || found,
      args: resolvedArgs,
      initialization: config.initialization,
    }
  }

  return { binary: found, args: config.args, initialization: config.initialization }
}

async function startServer(
  state: ServerState,
  serverId: string,
  filePath: string,
  directory: string,
  onStatusChanged?: () => void,
): Promise<ServerHandle | undefined> {
  const config = findServerById(serverId)
  if (!config) return

  const key = serverId
  if (state.broken.has(key)) return
  if (state.clients.has(key)) return state.clients.get(key)!

  const root = config.root(filePath, directory) || directory
  const resolved = await resolveServer(config, directory)
  if (!resolved) {
    state.broken.add(key)
    return
  }
  const { binary: bin, args: serverArgs, initialization: serverInit } = resolved

  console.log(`[lsp] spawn: ${bin} ${serverArgs.join(' ')}`)
  const spawnOpts: any = { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env } }
  if (process.platform === 'win32' && (bin.endsWith('.cmd') || bin.endsWith('.bat'))) {
    spawnOpts.shell = true
    console.log(`[lsp] spawn with shell: cmd /c "${bin} ${serverArgs.join(' ')}"`)
  }
  const proc = spawn(bin, serverArgs, spawnOpts)

  proc.stdout?.on('data', (chunk: Buffer) => {
    console.log(`[lsp:stdout ${key}]`, chunk.toString().substring(0, 500))
  })
  proc.stderr?.on('data', (chunk: Buffer) => {
    console.log(`[lsp:stderr ${key}]`, chunk.toString().substring(0, 500))
  })
  proc.on('error', () => { state.broken.add(key) })
  proc.on('exit', (code) => { console.log(`[lsp:exit ${key}]`, code); state.clients.delete(key); onStatusChanged?.() })

  const connection = createMessageConnection(
    new StreamMessageReader(proc.stdout),
    new StreamMessageWriter(proc.stdin),
  )

  const handle: ServerHandle = {
    process: proc,
    connection,
    root,
    config,
    files: {},
    diagnostics: {},
    connectedAt: Date.now(),
    triggerFilePath: filePath,
  }

  connection.onNotification('textDocument/publishDiagnostics', (params: any) => {
    const parsed = parseDiagnostics(params.uri, params.diagnostics)
    for (const [fp, entries] of Object.entries(parsed)) {
      const existing = handle.diagnostics[fp] || []
      handle.diagnostics[fp] = dedupeDiagnostics([...existing, ...entries])
    }
  })

  connection.onRequest('window/workDoneProgress/create', () => null)
  connection.onRequest('workspace/configuration', () => [])
  connection.onRequest('workspace/workspaceFolders', () => [
    { name: 'workspace', uri: pathToFileURL(root) },
  ])
  connection.onRequest('client/registerCapability', (params: any) => {
    if (params?.registrations?.length) {
      for (const reg of params.registrations) {
        if (reg.method === 'textDocument/diagnostic') {
          handle.diagnosticPullRegistered = true
        }
      }
    }
    return null
  })
  connection.onRequest('client/unregisterCapability', () => null)
  connection.listen()

  try {
    const result: any = await withTimeout(
      connection.sendRequest('initialize', {
        rootUri: pathToFileURL(root),
        processId: process.pid,
        workspaceFolders: [{ name: 'workspace', uri: pathToFileURL(root) }],
        initializationOptions: serverInit || {},
        capabilities: {
          textDocument: {
            synchronization: { didOpen: true, didChange: true },
            publishDiagnostics: { versionSupport: false },
          },
          window: { workDoneProgress: true },
          workspace: { configuration: true },
        },
      }),
      INITIALIZE_TIMEOUT_MS,
    )

    await connection.sendNotification('initialized', {})
    if (serverInit) {
      await connection.sendNotification('workspace/didChangeConfiguration', {
        settings: serverInit,
      })
    }
  } catch (err) {
    connection.end()
    connection.dispose()
    proc.kill()
    state.broken.add(key)
    return
  }

  state.clients.set(key, handle)
  return handle
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms)
    promise.then(
      (v) => { clearTimeout(timer); resolve(v) },
      (e) => { clearTimeout(timer); reject(e) },
    )
  })
}

const mainPlugin: MainPlugin = {
  name: PLUGIN_NAME,
  version: '2.0.0',
  description: 'LSP diagnostics main process',

  install: (ctx: MainPluginContext) => {
    const state: ServerState = { clients: new Map(), broken: new Set() }
    const bridge = createMainBridge(ctx)

    const getServerStatusList = (): ServerStatusInfo[] => {
      const list: ServerStatusInfo[] = []
      for (const [serverId, handle] of state.clients.entries()) {
        list.push({
          serverId,
          binary: handle.config.binary,
          filePath: handle.triggerFilePath,
          connectedAt: handle.connectedAt,
        })
      }
      list.sort((a, b) => a.connectedAt - b.connectedAt)
      return list
    }

    const broadcastStatus = () => {
      bridge.broadcast('server-status-changed', getServerStatusList())
    }

    bridge.handle('init-server', async (params) => {
      const handle = await startServer(state, params.serverId, params.filePath, params.directory, broadcastStatus)
      broadcastStatus()
      return { ok: !!handle, error: handle ? undefined : `Failed to start server: ${params.serverId}` }
    })

    bridge.handle('get-server-status', async () => {
      return { servers: getServerStatusList() }
    })

    bridge.handle('open-document', async (params) => {
      const handle = state.clients.get(params.serverId)
      if (!handle) return { ok: false, version: -1 }

      const ext = path.extname(params.filePath)
      const languageId = LANGUAGE_EXTENSIONS[ext] || 'plaintext'
      const absolutePath = path.resolve(params.filePath)
      const text = fs.readFileSync(absolutePath, 'utf-8')
      const existing = handle.files[absolutePath]
      const uri = pathToFileURL(absolutePath)

      if (existing !== undefined) {
        const next = existing.version + 1
        handle.files[absolutePath] = { version: next }
        await handle.connection.sendNotification('textDocument/didChange', {
          textDocument: { uri, version: next },
          contentChanges: [{ text }],
        })
        return { ok: true, version: next }
      }

      handle.files[absolutePath] = { version: 0 }
      await handle.connection.sendNotification('textDocument/didOpen', {
        textDocument: { uri, languageId, version: 0, text },
      })
      return { ok: true, version: 0 }
    })

    bridge.handle('get-diagnostics', async (params) => {
      const result: Record<string, DiagnosticEntry[]> = {}
      const entries = params.serverId
        ? [state.clients.get(params.serverId)].filter(Boolean)
        : [...state.clients.values()]

      for (const handle of entries) {
        // 主动拉取诊断（pull 模式）
        if (handle!.diagnosticPullRegistered && params.filePath) {
          try {
            const uri = pathToFileURL(params.filePath)
            const report: any = await withTimeout(
              handle!.connection.sendRequest('textDocument/diagnostic', {
                textDocument: { uri },
              }),
              3000,
            )
            if (report?.items) {
              const parsed = parseDiagnostics(uri, report.items)
              for (const [fp, entries] of Object.entries(parsed)) {
                const arr = result[fp] || []
                arr.push(...entries)
                result[fp] = arr
              }
            }
            if (report?.relatedDocuments) {
              for (const [relUri, relDoc] of Object.entries(report.relatedDocuments) as any) {
                const parsed = parseDiagnostics(relUri, (relDoc as any).items)
                for (const [fp, entries] of Object.entries(parsed)) {
                  const arr = result[fp] || []
                  arr.push(...entries)
                  result[fp] = arr
                }
              }
            }
          } catch {}
        }

        // 合并推送诊断（push 模式）
        for (const [fp, diags] of Object.entries(handle!.diagnostics)) {
          const arr = result[fp] || []
          arr.push(...diags)
          result[fp] = arr
        }
      }

      for (const fp of Object.keys(result)) {
        result[fp] = dedupeDiagnostics(result[fp])
      }

      return { diagnostics: result }
    })

    bridge.handle('shutdown-server', async (params) => {
      const handle = state.clients.get(params.serverId)
      if (!handle) return
      try { await handle.connection.sendRequest('shutdown'); handle.connection.sendNotification('exit') } catch {}
      handle.connection.end()
      handle.connection.dispose()
      handle.process.kill()
      state.clients.delete(params.serverId)
    })

    bridge.handle('shutdown-all', async () => {
      for (const [id, handle] of state.clients.entries()) {
        try { await handle.connection.sendRequest('shutdown'); handle.connection.sendNotification('exit') } catch {}
        handle.connection.end()
        handle.connection.dispose()
        handle.process.kill()
        state.clients.delete(id)
      }
    })

    ctx.onUnload(() => {
      for (const [, handle] of state.clients.entries()) {
        try { handle.connection.sendNotification('exit') } catch {}
        handle.connection.end()
        handle.connection.dispose()
        handle.process.kill()
      }
      state.clients.clear()
      state.broken.clear()
    })
  },

  uninstall: () => {},
}

export default mainPlugin
