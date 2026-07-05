// @ts-nocheck
import { clipboard, contextBridge, shell } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { aiServices } from './services/ai/index'
import fs from 'fs'
import path from 'path'
import mime from 'mime-types'
import url from 'url'
import { app, getCurrentWindow } from '@electron/remote'
import { exec, spawn, fork } from 'child_process'
import os from 'os'
import { type ElectronAPI, PluginIpcTimeoutError, PLUGIN_IPC_DEFAULT_TIMEOUT_MS } from '@agent-qi/types'
import Electron from 'electron'
type ExecNodejsOptions = {
  code?: string
  codePath?: string
  file?: string
  args?: unknown[]
  modules?: string[] | Record<string, string>
  cwd?: string
  moduleBasePath?: string
  env?: Record<string, string | undefined>
  timeoutMs?: number
  maxBuffer?: number
  detached?: boolean
}

type ExecNodejsResult<T = unknown> = {
  ok: boolean
  code: number | null
  stdout: string
  stderr: string
  result?: T
  pid?: number
  error?: {
    name?: string
    message: string
    stack?: string
  }
  errorMessage?: string
  errorCode?: string
}

const rewriteAsarExecutablePath = (candidate: string): string => {
  const normalized = path.normalize(candidate)
  const asarSegment = `${path.sep}app.asar${path.sep}`
  if (!normalized.includes(asarSegment)) {
    return normalized
  }

  return normalized.replace(asarSegment, `${path.sep}app.asar.unpacked${path.sep}`)
}

const resolveRipgrepPath = (): string | null => {
  const executableName = `rg${process.platform === 'win32' ? '.exe' : ''}`
  const candidates = new Set<string>()
  const addCandidate = (candidate?: string | null) => {
    if (!candidate) return
    const normalized = path.normalize(candidate)
    candidates.add(normalized)

    const rewritten = rewriteAsarExecutablePath(normalized)
    if (rewritten !== normalized) {
      candidates.add(rewritten)
    }
  }

  try {
    const { rgPath } = require('@vscode/ripgrep')
    addCandidate(rgPath)
  } catch {
    // ignore module resolution errors and continue with fallbacks
  }

  try {
    const packageJsonPath = require.resolve('@vscode/ripgrep/package.json')
    const packageDir = path.dirname(packageJsonPath)
    addCandidate(path.join(packageDir, 'bin', executableName))
  } catch {
    // ignore module resolution errors and continue with fallbacks
  }

  const appPath = app.getAppPath()
  addCandidate(path.join(appPath, 'node_modules', '@vscode', 'ripgrep', 'bin', executableName))
  addCandidate(
    path.join(
      process.resourcesPath,
      'app.asar.unpacked',
      'node_modules',
      '@vscode',
      'ripgrep',
      'bin',
      executableName
    )
  )
  addCandidate(
    path.join(process.resourcesPath, 'node_modules', '@vscode', 'ripgrep', 'bin', executableName)
  )

  for (const candidate of candidates) {
    if (candidate.includes(`${path.sep}app.asar${path.sep}`)) {
      continue
    }

    if (fs.existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

const getBundledRipgrepPath = (): string | null => resolveRipgrepPath()

const execFileCommand = (
  file: string,
  args: string[] = [],
  options: { cwd?: string; maxBuffer?: number } = {}
): Promise<{
  code: number | null
  stdout: string
  stderr: string
  errorMessage?: string
  errorCode?: string
}> => {
  return new Promise((resolve) => {
    const maxBuffer = options.maxBuffer ?? 1024 * 1024
    const child = spawn(file, args, {
      cwd: options.cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    })

    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let settled = false

    const finish = (result: {
      code: number | null
      stdout: string
      stderr: string
      errorMessage?: string
      errorCode?: string
    }) => {
      if (settled) return
      settled = true
      resolve(result)
    }

    const appendChunk = (target: 'stdout' | 'stderr', chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      const bytes = Buffer.byteLength(text)

      if (target === 'stdout') {
        stdout += text
        stdoutBytes += bytes
      } else {
        stderr += text
        stderrBytes += bytes
      }

      if (stdoutBytes + stderrBytes > maxBuffer) {
        child.kill()
        finish({
          code: null,
          stdout,
          stderr,
          errorMessage: `stdout maxBuffer length exceeded: ${maxBuffer}`,
          errorCode: 'MAX_BUFFER'
        })
      }
    }

    child.stdout?.on('data', (chunk) => appendChunk('stdout', chunk))
    child.stderr?.on('data', (chunk) => appendChunk('stderr', chunk))

    child.on('error', (error) => {
      const errorWithCode = error as NodeJS.ErrnoException & { code?: number | string }
      finish({
        code: typeof errorWithCode.code === 'number' ? errorWithCode.code : null,
        stdout,
        stderr,
        errorMessage: errorWithCode.message,
        errorCode: typeof errorWithCode.code === 'string' ? errorWithCode.code : undefined
      })
    })

    child.on('close', (code) => {
      if (code && code !== 0) {
        finish({
          code,
          stdout,
          stderr,
          errorMessage: stderr.trim() || stdout.trim() || `Command failed with exit code ${code}`
        })
        return
      }

      finish({
        code,
        stdout,
        stderr
      })
    })
  })
}

const NODEJS_BOOTSTRAP = String.raw`
const fs = require('node:fs')
const path = require('node:path')
const { createRequire } = require('node:module')
const { pathToFileURL } = require('node:url')

const readStdin = () => new Promise((resolve, reject) => {
  let data = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => { data += chunk })
  process.stdin.on('end', () => resolve(data))
  process.stdin.on('error', reject)
})

const serialize = (value) => {
  try {
    JSON.stringify(value)
    return value
  } catch {
    return String(value)
  }
}

const resolveRequireAnchor = (basePath) => {
  const normalized = path.resolve(basePath || process.cwd())
  try {
    const stat = fs.existsSync(normalized) ? fs.statSync(normalized) : null
    if (stat?.isFile()) return normalized
  } catch {
  }
  return path.join(normalized, 'package.json')
}

const loadModule = async (requireFromBase, request) => {
  try {
    return requireFromBase(request)
  } catch (error) {
    if (error?.code !== 'ERR_REQUIRE_ESM') {
      throw error
    }
    const resolved = requireFromBase.resolve(request)
    return await import(pathToFileURL(resolved).href)
  }
}

const loadModules = async (requireFromBase, modules) => {
  if (!modules) return {}
  if (Array.isArray(modules)) {
    return Object.fromEntries(
      await Promise.all(modules.map(async (name) => [name, await loadModule(requireFromBase, name)]))
    )
  }
  return Object.fromEntries(await Promise.all(
    Object.entries(modules).map(async ([alias, request]) => [alias, await loadModule(requireFromBase, request)])
  )
  )
}

const loadCodePath = async (requireFromBase, filePath, cwd, tempDir) => {
  const resolvedPath = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(cwd, filePath)
  const extension = path.extname(resolvedPath).toLowerCase()

  if (!['.ts', '.tsx', '.mts', '.cts'].includes(extension)) {
    return await loadModule(requireFromBase, resolvedPath)
  }

  const ts = await loadModule(requireFromBase, 'typescript').catch((error) => {
    throw new Error(
      'Executing TypeScript codePath requires the plugin to include "typescript": ' + (error?.message || error)
    )
  })
  const source = fs.readFileSync(resolvedPath, 'utf8')
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX
    },
    fileName: resolvedPath
  })
  const outPath = path.join(tempDir, path.basename(resolvedPath) + '.cjs')
  fs.writeFileSync(outPath, transpiled.outputText, 'utf8')
  return requireFromBase(outPath)
}

(async () => {
  const payload = JSON.parse(await readStdin() || '{}')
  const cwd = path.resolve(payload.cwd || process.cwd())
  const moduleBasePath = path.resolve(payload.moduleBasePath || cwd)
  const requireFromBase = createRequire(resolveRequireAnchor(moduleBasePath))
  const modules = await loadModules(requireFromBase, payload.modules)

  let result
  const codePath = payload.codePath || payload.file
  if (codePath) {
    const loaded = await loadCodePath(requireFromBase, codePath, cwd, payload.tempDir)
    const runner = typeof loaded === 'function' ? loaded : loaded?.default
    result = typeof runner === 'function'
      ? await runner(...(payload.args || []), { modules, require: requireFromBase, cwd })
      : loaded
  } else if (payload.code) {
    const runner = new Function(
      'modules',
      'args',
      'require',
      'cwd',
      'process',
      'console',
      'Buffer',
      'setTimeout',
      'clearTimeout',
      '"use strict"; return (async () => { ' + payload.code + '\n })()'
    )
    result = await runner(
      modules,
      payload.args || [],
      requireFromBase,
      cwd,
      process,
      console,
      Buffer,
      setTimeout,
      clearTimeout
    )
  } else {
    throw new Error('execNodejs requires code, codePath, or file.')
  }

  fs.writeFileSync(payload.resultPath, JSON.stringify({ ok: true, result: serialize(result) }), 'utf8')
})().catch((error) => {
  try {
    fs.writeFileSync(process.env.AGENT_QI_EXEC_NODEJS_RESULT_PATH, JSON.stringify({
      ok: false,
      error: {
        name: error && error.name ? String(error.name) : undefined,
        message: error && error.message ? String(error.message) : String(error),
        stack: error && error.stack ? String(error.stack) : undefined
      }
    }), 'utf8')
  } catch {
  }
  process.exitCode = 1
})
`

const execNodejs = <T = unknown>(options: ExecNodejsOptions): Promise<ExecNodejsResult<T>> => {
  return new Promise((resolve) => {
    const cwd = options.cwd || options.moduleBasePath || app.getPath('userData')
    const maxBuffer = options.maxBuffer ?? 1024 * 1024
    const timeoutMs = options.timeoutMs ?? 60_000
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-qi-nodejs-'))
    const bootstrapPath = path.join(tempDir, 'bootstrap.cjs')
    const resultPath = path.join(tempDir, 'result.json')
    fs.writeFileSync(bootstrapPath, NODEJS_BOOTSTRAP, 'utf8')

    const execPath = process.execPath || 'node'
    const child = spawn(execPath, [bootstrapPath], {
      cwd,
      windowsHide: true,
      detached: Boolean(options.detached),
      stdio: options.detached ? ['pipe', 'ignore', 'ignore'] : ['pipe', 'pipe', 'pipe'],
      env: {
        ...process.env,
        ...options.env,
        ELECTRON_RUN_AS_NODE: '1',
        AGENT_QI_EXEC_NODEJS_RESULT_PATH: resultPath
      }
    })

    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const cleanup = () => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true })
      } catch {}
    }

    const finish = (result: ExecNodejsResult<T>) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      if (!options.detached) cleanup()
      resolve(result)
    }

    if (options.detached) {
      child.on('error', (error) => {
        const errorWithCode = error as NodeJS.ErrnoException & { code?: number | string }
        finish({
          ok: false,
          code: typeof errorWithCode.code === 'number' ? errorWithCode.code : null,
          stdout,
          stderr,
          errorMessage: errorWithCode.message,
          errorCode: typeof errorWithCode.code === 'string' ? errorWithCode.code : undefined
        })
      })
      child.stdin?.end(
        JSON.stringify({
          code: options.code,
          codePath: options.codePath,
          file: options.file,
          args: options.args || [],
          modules: options.modules,
          cwd,
          moduleBasePath: options.moduleBasePath || cwd,
          resultPath,
          tempDir
        })
      )
      if (typeof child.unref === 'function') child.unref()
      setTimeout(() => {
        finish({
          ok: true,
          code: null,
          stdout,
          stderr,
          pid: child.pid
        })
      }, 50)
      return
    }

    const appendChunk = (target: 'stdout' | 'stderr', chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8')
      const bytes = Buffer.byteLength(text)
      if (target === 'stdout') {
        stdout += text
        stdoutBytes += bytes
      } else {
        stderr += text
        stderrBytes += bytes
      }
      if (stdoutBytes + stderrBytes > maxBuffer) {
        child.kill()
        finish({
          ok: false,
          code: null,
          stdout,
          stderr,
          errorMessage: `stdout maxBuffer length exceeded: ${maxBuffer}`,
          errorCode: 'MAX_BUFFER'
        })
      }
    }

    timer = setTimeout(() => {
      child.kill()
      finish({
        ok: false,
        code: null,
        stdout,
        stderr,
        errorMessage: `execNodejs timed out after ${timeoutMs}ms`,
        errorCode: 'TIMEOUT'
      })
    }, timeoutMs)

    child.stdout?.on('data', (chunk) => appendChunk('stdout', chunk))
    child.stderr?.on('data', (chunk) => appendChunk('stderr', chunk))
    child.on('error', (error) => {
      const errorWithCode = error as NodeJS.ErrnoException & { code?: number | string }
      finish({
        ok: false,
        code: typeof errorWithCode.code === 'number' ? errorWithCode.code : null,
        stdout,
        stderr,
        errorMessage: errorWithCode.message,
        errorCode: typeof errorWithCode.code === 'string' ? errorWithCode.code : undefined
      })
    })
    child.on('close', (code) => {
      let payload: { ok?: boolean; result?: T; error?: ExecNodejsResult<T>['error'] } | null = null
      try {
        if (fs.existsSync(resultPath)) {
          payload = JSON.parse(fs.readFileSync(resultPath, 'utf8'))
        }
      } catch {}

      finish({
        ok: Boolean(payload?.ok) && (code === 0 || code === null),
        code,
        stdout,
        stderr,
        result: payload?.result,
        error: payload?.error,
        ...(!payload?.ok && !payload?.error && code
          ? {
              errorMessage:
                stderr.trim() || stdout.trim() || `Node.js execution failed with exit code ${code}`
            }
          : {})
      })
    })

    child.stdin?.end(
      JSON.stringify({
        code: options.code,
        codePath: options.codePath,
        file: options.file,
        args: options.args || [],
        modules: options.modules,
        cwd,
        moduleBasePath: options.moduleBasePath || cwd,
        resultPath,
        tempDir
      })
    )
  })
}

export const api: ElectronAPI = {
  ...aiServices(),
  process: {
    platform: process.platform,
    env: process.env,
    execPath: process.execPath
  },
  pty: {
    spawn: (options: {
      id: string
      cols?: number
      rows?: number
      cwd?: string
      startupLocation?: string
      customLocationPath?: string
    }) => electronAPI.ipcRenderer.invoke('pty:spawn', options),
    write: (id: string, data: string) => electronAPI.ipcRenderer.invoke('pty:write', { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      electronAPI.ipcRenderer.invoke('pty:resize', { id, cols, rows }),
    kill: (id: string) => electronAPI.ipcRenderer.invoke('pty:kill', id),
    killByCwd: (cwd: string) => electronAPI.ipcRenderer.invoke('pty:killByCwd', cwd),
    onData: (id: string, callback: (data: string) => void) => {
      const listener = (_event: any, data: string) => callback(data)
      electronAPI.ipcRenderer.on(`pty:data:${id}`, listener)
      return () => electronAPI.ipcRenderer.removeListener(`pty:data:${id}`, listener)
    },
    onExit: (id: string, callback: (info: { exitCode: number; signal?: number }) => void) => {
      const listener = (_event: any, info: any) => callback(info)
      electronAPI.ipcRenderer.on(`pty:exit:${id}`, listener)
      return () => electronAPI.ipcRenderer.removeListener(`pty:exit:${id}`, listener)
    }
  },
  showOpenDialog: async (options: Electron.OpenDialogOptions) =>
    (await electronAPI.ipcRenderer.invoke(
      'dialog:showOpenDialog',
      options
    )) as Electron.OpenDialogReturnValue,
  showSaveDialog: async (options: Electron.SaveDialogOptions) =>
    (await electronAPI.ipcRenderer.invoke(
      'dialog:showSaveDialog',
      options
    )) as Electron.SaveDialogReturnValue,
  app,
  openDevTools: () => getCurrentWindow().webContents.openDevTools(),
  isPackaged: app.isPackaged,
  getPath: app.getPath,
  getAppPath: app.getAppPath,
  getPluginsPath: () => {
    return path.join(app.getPath('userData'), 'plugins')
  },
  getBundledRipgrepPath,
  execFileCommand,
  execNodejs,
  shell,
  clipboard: {
    writeText: (text: string) => clipboard.writeText(text),
    readText: () => clipboard.readText(),
    copyHtmlImage: (payload: {
      html: string
      width?: number
      height?: number
      backgroundColor?: string
    }) => electronAPI.ipcRenderer.invoke('clipboard:capture-html-image', payload)
  },
  exporter: {
    saveHtmlImage: (payload: {
      html: string
      filePath: string
      width?: number
      height?: number
      backgroundColor?: string
    }) => electronAPI.ipcRenderer.invoke('export:capture-html-image', payload)
  },
  fs,
  path,
  mime,
  url,
  chatDb: {
    chat: {
      list: () => electronAPI.ipcRenderer.invoke('chatDb:chat:list'),
      create: (summary: ChatSummary) => electronAPI.ipcRenderer.invoke('chatDb:chat:create', summary),
      update: (chatId: string, updates: Partial<ChatSummary>) => electronAPI.ipcRenderer.invoke('chatDb:chat:update', chatId, updates),
      delete: (chatId: string) => electronAPI.ipcRenderer.invoke('chatDb:chat:delete', chatId)
    },
    message: {
      loadRecent: (chatId: string, limit: number) => electronAPI.ipcRenderer.invoke('chatDb:message:loadRecent', chatId, limit),
      loadBefore: (chatId: string, beforeOrder: number, limit: number) => electronAPI.ipcRenderer.invoke('chatDb:message:loadBefore', chatId, beforeOrder, limit),
      loadAll: (chatId: string) => electronAPI.ipcRenderer.invoke('chatDb:message:loadAll', chatId),
      replaceAll: (chatId: string, messages: BaseMessage[]) => electronAPI.ipcRenderer.invoke('chatDb:message:replaceAll', chatId, messages),
      replaceFrom: (chatId: string, anchorMessageId: string, messages: BaseMessage[]) => electronAPI.ipcRenderer.invoke('chatDb:message:replaceFrom', chatId, anchorMessageId, messages),
      append: (chatId: string, messages: BaseMessage[]) => electronAPI.ipcRenderer.invoke('chatDb:message:append', chatId, messages),
      delete: (messageId: string) => electronAPI.ipcRenderer.invoke('chatDb:message:delete', messageId),
      deleteAll: (chatId: string) => electronAPI.ipcRenderer.invoke('chatDb:message:deleteAll', chatId),
      clearAll: () => electronAPI.ipcRenderer.invoke('chatDb:message:clearAll'),
      upsert: (chatId: string, message: BaseMessage, seqHint?: number) => electronAPI.ipcRenderer.invoke('chatDb:message:upsert', chatId, message, seqHint),
      replaceParts: (messageId: string, parts: BaseMessage['parts']) => electronAPI.ipcRenderer.invoke('chatDb:message:replaceParts', messageId, parts),
      upsertPart: (messageId: string, idx: number, part: BaseMessage['parts'][number]) => electronAPI.ipcRenderer.invoke('chatDb:message:upsertPart', messageId, idx, part),
      updateMetadata: (messageId: string, metadata: MetaData) => electronAPI.ipcRenderer.invoke('chatDb:message:updateMetadata', messageId, metadata),
      finalize: (chatId: string, message: BaseMessage) => electronAPI.ipcRenderer.invoke('chatDb:message:finalize', chatId, message)
    },
    snapshot: {
      export: (options: { summaries: ChatSummary[]; activeChatId: string | null; chatDrafts: Record<string, string> }) => electronAPI.ipcRenderer.invoke('chatDb:snapshot:export', options),
      import: (snapshot: ChatRepositorySnapshot) => electronAPI.ipcRenderer.invoke('chatDb:snapshot:import', snapshot)
    }
  },
  sqlite: {
    isSupported: () => electronAPI.ipcRenderer.invoke('sqlite:isSupported'),
    upsertChunks: (chunks: any[]) => electronAPI.ipcRenderer.invoke('sqlite:upsertChunks', chunks),
    updateChunks: (chunks: any[]) => electronAPI.ipcRenderer.invoke('sqlite:updateChunks', chunks),
    deleteChunksByDoc: (docId: string) =>
      electronAPI.ipcRenderer.invoke('sqlite:deleteChunksByDoc', docId),
    deleteChunksByKb: (kbId: string) =>
      electronAPI.ipcRenderer.invoke('sqlite:deleteChunksByKb', kbId),
    getChunkCountsByDoc: (params: { doc_ids: string[] }) =>
      electronAPI.ipcRenderer.invoke('sqlite:getChunkCountsByDoc', params),
    search: (options: any) => electronAPI.ipcRenderer.invoke('sqlite:search', options),
    getAllChunks: () => electronAPI.ipcRenderer.invoke('sqlite:getAllChunks'),
    getChunksByHash: (params: { content_hashes: string[]; model_id: string }) =>
      electronAPI.ipcRenderer.invoke('sqlite:getChunksByHash', params)
  },
  exec,
  spawn,
  fork,
  os,
  watch: (path: string, callback: (event: string, filename: string) => void) => {
    const watcher = fs.watch(path, { recursive: true }, callback)
    return () => watcher.close()
  },
  setTitleBarTheme: (isDarkMode: boolean) =>
    electronAPI.ipcRenderer.invoke('window:set-title-bar-theme', isDarkMode),
  // 获取所有进程（主进程/渲染进程/GPU/Utility）的内存指标
  getProcessMetrics: () => electronAPI.ipcRenderer.invoke('app:get-process-metrics'),
  createTempChat: (data: any) => electronAPI.ipcRenderer.invoke('window:create-temp-chat', data),
  getTempChatData: (windowId: string) =>
    electronAPI.ipcRenderer.invoke('window:get-temp-chat-data', windowId),
  window: {
    isFullScreen: () => getCurrentWindow().isFullScreen(),
    onFullScreenChanged: (callback: (isFullScreen: boolean) => void) => {
      const currentWindow = getCurrentWindow()
      const handleEnter = () => callback(true)
      const handleLeave = () => callback(false)

      currentWindow.on('enter-full-screen', handleEnter)
      currentWindow.on('leave-full-screen', handleLeave)

      return () => {
        currentWindow.removeListener('enter-full-screen', handleEnter)
        currentWindow.removeListener('leave-full-screen', handleLeave)
      }
    }
  },
  system: {
    getSettings: () => electronAPI.ipcRenderer.invoke('system:get-settings'),
    setOpenAtLogin: (enabled: boolean) =>
      electronAPI.ipcRenderer.invoke('system:set-open-at-login', enabled)
  },
  updater: {
    getVersion: () => electronAPI.ipcRenderer.invoke('updater:get-version'),
    checkForUpdates: () => electronAPI.ipcRenderer.invoke('updater:check-for-updates'),
    downloadUpdate: () => electronAPI.ipcRenderer.invoke('updater:download-update'),
    quitAndInstall: () => electronAPI.ipcRenderer.invoke('updater:quit-and-install'),
    onStatus: (callback: (status: any) => void) => {
      const listener = (_event: any, status: any) => callback(status)
      electronAPI.ipcRenderer.on('updater:status', listener)
      return () => {
        electronAPI.ipcRenderer.removeListener('updater:status', listener)
      }
    }
  },
  net: {
    fetch: (url: string, options?: any) =>
      electronAPI.ipcRenderer.invoke('net:fetch', url, options),
    download: (options: { url: string; destPath: string; id?: string; offset?: number }) =>
      electronAPI.ipcRenderer.invoke('net:download', options),
    onDownloadProgress: (id: string, callback: (progress: any) => void) => {
      const listener = (_event: any, progress: any) => callback(progress)
      electronAPI.ipcRenderer.on(`net:download-progress:${id}`, listener)
      return () => electronAPI.ipcRenderer.removeListener(`net:download-progress:${id}`, listener)
    },
    cancelDownload: (id: string) => electronAPI.ipcRenderer.invoke('net:cancel-download', id)
  },
  applyPatch: {
    execute: (payload: { baseDir: string; patch: string }) =>
      electronAPI.ipcRenderer.invoke('apply-patch:execute', payload)
  },
  hashline: {
    read: (payload: {
      baseDir: string
      path: string
      start_line?: number
      end_line?: number
      limit?: number
      max_columns?: number
      format?: 'hashline' | 'plain'
    }) => electronAPI.ipcRenderer.invoke('hashline:read', payload)
  },
  editFile: {
    execute: (payload: {
      baseDir: string
      type?: 'add' | 'delete' | 'update' | 'move' | 'replace'
      input?: string
      path?: string
      new_path?: string
      content?: string
      old_string?: string
      new_string?: string
      replace_all?: boolean
    }) =>
      electronAPI.ipcRenderer.invoke('edit-file:execute', payload)
  },
  sync: {
    startHost: (options?: { displayName?: string; port?: number }) =>
      electronAPI.ipcRenderer.invoke('sync:start-host', options),
    stopHost: () => electronAPI.ipcRenderer.invoke('sync:stop-host'),
    getHostState: () => electronAPI.ipcRenderer.invoke('sync:get-host-state'),
    updateProfile: (options: { displayName?: string }) =>
      electronAPI.ipcRenderer.invoke('sync:update-profile', options),
    publishSnapshot: (payload: { deviceId: string; displayName: string; snapshot: any }) =>
      electronAPI.ipcRenderer.invoke('sync:publish-snapshot', payload),
    listEndpoints: () => electronAPI.ipcRenderer.invoke('sync:list-endpoints'),
    getEndpointSnapshot: (deviceId: string) =>
      electronAPI.ipcRenderer.invoke('sync:get-endpoint-snapshot', deviceId),
    onEvent: (callback: (event: any) => void) => {
      const listener = (_event: any, payload: any) => callback(payload)
      electronAPI.ipcRenderer.on('sync:event', listener)
      return () => electronAPI.ipcRenderer.removeListener('sync:event', listener)
    }
  },
  computer: {
    isAvailable: () => electronAPI.ipcRenderer.invoke('computer:is-available'),
    getScreenSize: () => electronAPI.ipcRenderer.invoke('computer:get-screen-size'),
    getMousePosition: () => electronAPI.ipcRenderer.invoke('computer:get-mouse-position'),
    moveMouse: (options: {
      x: number
      y: number
      coordinateSpace?: 'screen' | 'screenshot'
      originX?: number
      originY?: number
      displayId?: string
      smooth?: boolean
      speed?: number
      delayMs?: number
    }) => electronAPI.ipcRenderer.invoke('computer:move-mouse', options),
    mouseClick: (options?: {
      button?: 'left' | 'right' | 'middle'
      double?: boolean
      x?: number
      y?: number
      coordinateSpace?: 'screen' | 'screenshot'
      originX?: number
      originY?: number
      displayId?: string
      smooth?: boolean
      speed?: number
      delayMs?: number
    }) => electronAPI.ipcRenderer.invoke('computer:mouse-click', options),
    dragMouse: (options: {
      x: number
      y: number
      startX?: number
      startY?: number
      button?: 'left' | 'right' | 'middle'
      coordinateSpace?: 'screen' | 'screenshot'
      originX?: number
      originY?: number
      displayId?: string
      smooth?: boolean
      speed?: number
      delayMs?: number
    }) => electronAPI.ipcRenderer.invoke('computer:drag-mouse', options),
    scrollMouse: (options: { x: number; y: number; delayMs?: number }) =>
      electronAPI.ipcRenderer.invoke('computer:scroll-mouse', options),
    typeText: (options: { text: string; cpm?: number; delayMs?: number }) =>
      electronAPI.ipcRenderer.invoke('computer:type-text', options),
    keyTap: (options: { key: string; modifiers?: string[]; delayMs?: number }) =>
      electronAPI.ipcRenderer.invoke('computer:key-tap', options),
    getPixelColor: (options: {
      x: number
      y: number
      coordinateSpace?: 'screen' | 'screenshot'
      originX?: number
      originY?: number
      displayId?: string
    }) => electronAPI.ipcRenderer.invoke('computer:get-pixel-color', options),
    captureScreen: (options?: {
      x?: number
      y?: number
      width?: number
      height?: number
      maxSidePx?: number
      format?: 'png' | 'jpeg'
      quality?: number
      annotate?: boolean
      displayId?: string
    }) => electronAPI.ipcRenderer.invoke('computer:capture-screen', options)
  },
  pluginMain: {
    load: (payload: {
      pluginName: string
      pluginDir: string
      mainEntry: string
      info?: Record<string, unknown>
    }) => electronAPI.ipcRenderer.invoke('plugin:main:load', payload),
    unload: (pluginName: string) => electronAPI.ipcRenderer.invoke('plugin:main:unload', pluginName),
    reload: (payload: {
      pluginName: string
      pluginDir: string
      mainEntry: string
      info?: Record<string, unknown>
    }) => electronAPI.ipcRenderer.invoke('plugin:main:reload', payload),
    ipc: {
      invoke: (pluginName: string, channel: string, ...args: unknown[]) => {
        const fullChannel = `plugin:${pluginName}:${channel}`
        const timeoutMs = PLUGIN_IPC_DEFAULT_TIMEOUT_MS
        if (timeoutMs <= 0) {
          return electronAPI.ipcRenderer.invoke(fullChannel, ...args)
        }
        let timer: ReturnType<typeof setTimeout> | undefined
        return Promise.race([
          electronAPI.ipcRenderer.invoke(fullChannel, ...args).finally(() => {
            if (timer) clearTimeout(timer)
          }),
          new Promise((_, reject) => {
            timer = setTimeout(
              () => reject(new PluginIpcTimeoutError(pluginName, channel, timeoutMs)),
              timeoutMs
            )
          })
        ])
      },
      on: (pluginName: string, channel: string, callback: (...args: unknown[]) => void) => {
        const fullChannel = `plugin:${pluginName}:${channel}`
        const listener = (_event: any, ...args: any[]) => callback(...args)
        electronAPI.ipcRenderer.on(fullChannel, listener)
        return () => electronAPI.ipcRenderer.removeListener(fullChannel, listener)
      }
    }
  }
}

// @ts-ignore - 类型推断需要引用 .pnpm/@ai-sdk+provider，不可移植
export type API = typeof api
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
