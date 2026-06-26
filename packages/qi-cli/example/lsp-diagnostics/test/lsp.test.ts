import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import path from 'path'
import fs from 'fs'
import os from 'os'
import { pathToFileURL } from 'url'
import { spawn } from 'child_process'
import { createMessageConnection, StreamMessageReader, StreamMessageWriter } from 'vscode-jsonrpc/node'

import { SERVER_CONFIGS, findServerByExtension, findServerById, resolveBinary, resolveNpm } from '../src/server-config'
import { LANGUAGE_EXTENSIONS } from '../src/language'
import { resolveServer } from '../src/main'

// ============================================================
// Unit: server-config
// ============================================================

describe('server-config', () => {
  test('has all 38 server configs', () => {
    expect(SERVER_CONFIGS.length).toBe(38)
  })

  test('each has id, extensions, binary, args', () => {
    for (const s of SERVER_CONFIGS) {
      expect(s.id).toBeTruthy()
      expect(s.extensions.length).toBeGreaterThan(0)
      expect(s.binary).toBeTruthy()
      expect(Array.isArray(s.args)).toBe(true)
    }
  })

  test('no duplicate ids', () => {
    const ids = SERVER_CONFIGS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('findServerByExtension', () => {
    expect(findServerByExtension('.ts')?.id).toBe('typescript')
    expect(findServerByExtension('.go')?.id).toBe('gopls')
    expect(findServerByExtension('.rs')?.id).toBe('rust')
    expect(findServerByExtension('.py')?.id).toBe('pyright')
    expect(findServerByExtension('.xyz')).toBeUndefined()
  })

  test('findServerById', () => {
    expect(findServerById('typescript')?.binary).toBe('typescript-language-server')
    expect(findServerById('gopls')?.binary).toBe('gopls')
  })

  test('key servers have installers', () => {
    for (const id of ['typescript', 'vue', 'biome', 'pyright', 'gopls', 'rust', 'clangd', 'bash']) {
      const s = findServerById(id)
      expect(s?.installers?.length).toBeGreaterThan(0)
    }
  })

  test('resolveBinary returns undefined for non-existent binary', async () => {
    expect(await resolveBinary({ binary: 'nonexistent-xyz-test' } as any, __dirname)).toBeUndefined()
  })

  test('resolveNpm finds node_modules/.bin', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-test-'))
    try {
      const binDir = path.join(tmp, 'node_modules', '.bin')
      fs.mkdirSync(binDir, { recursive: true })
      const testBin = path.join(binDir, 'test-lsp-bin')
      fs.writeFileSync(testBin, '#!/usr/bin/env node\n', 'utf-8')
      if (process.platform !== 'win32') fs.chmodSync(testBin, 0o755)
      expect(resolveNpm('test-lsp-bin', tmp)).toBe(testBin)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('typescript root detection', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-test-'))
    try {
      fs.writeFileSync(path.join(tmp, 'package-lock.json'), '{}')
      const server = findServerById('typescript')!
      expect(server.root(path.join(tmp, 'src', 'test.ts'), tmp)).toBe(tmp)
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('rust root detection returns undefined without Cargo.toml', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-test-'))
    try {
      const server = findServerById('rust')!
      expect(server.root(path.join(tmp, 'main.rs'), tmp)).toBeUndefined()
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  test('all installers have valid types', () => {
    const validTypes = ['npm', 'go-install', 'gem-install', 'dotnet-tool', 'pip', 'pip-npm', 'download-zip', 'download-tar', 'github-release', 'rustup']
    for (const server of SERVER_CONFIGS) {
      if (!server.installers) continue
      for (const inst of server.installers) {
        expect(validTypes).toContain(inst.type)
        if (inst.type === 'npm') expect(inst.package).toBeTruthy()
      }
    }
  })
})

// ============================================================
// Unit: language extension map
// ============================================================

describe('language extension map', () => {
  test('maps common extensions', () => {
    for (const ext of ['.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.go', '.css', '.html', '.json', '.md']) {
      expect(LANGUAGE_EXTENSIONS[ext]).toBeTruthy()
    }
  })

  test('correct language IDs', () => {
    expect(LANGUAGE_EXTENSIONS['.ts']).toBe('typescript')
    expect(LANGUAGE_EXTENSIONS['.py']).toBe('python')
    expect(LANGUAGE_EXTENSIONS['.rs']).toBe('rust')
    expect(LANGUAGE_EXTENSIONS['.go']).toBe('go')
    expect(LANGUAGE_EXTENSIONS['.tsx']).toBe('typescriptreact')
  })

  test('at least 80 mappings', () => {
    expect(Object.keys(LANGUAGE_EXTENSIONS).length).toBeGreaterThanOrEqual(80)
  })
})

// ============================================================
// E2E: real typescript-language-server
// Tests plugin's resolveServer → spawn → initialize → didOpen → pull diagnostics
// opencode uses pull (textDocument/diagnostic) not push (publishDiagnostics) for TS
// ============================================================

describe('real typescript-language-server', () => {
  const tsConfig = findServerById('typescript')!
  const testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lsp-e2e-'))
  let binPath: string | undefined
  let serverArgs: string[] | undefined
  let serverInit: Record<string, any> | undefined
  let proc: import('child_process').ChildProcessWithoutNullStreams | undefined
  let conn: ReturnType<typeof createMessageConnection> | undefined
  let stderrBuf = ''

  beforeAll(async () => {
    fs.writeFileSync(path.join(testDir, 'tsconfig.json'), JSON.stringify({
      compilerOptions: { target: 'ES2020', module: 'commonjs', strict: true },
      include: ['*.ts'],
    }))
    fs.writeFileSync(path.join(testDir, 'test.ts'), 'const x: number = "hello";\n')

    // Install TypeScript in workspace so tsserver can use it
    const { execSync } = await import('child_process')
    execSync('npm init -y', { cwd: testDir, stdio: 'pipe' })
    execSync('npm install typescript', { cwd: testDir, stdio: 'pipe', timeout: 60000 })

    // Use plugin's own resolution
    const r = await resolveServer(tsConfig, __dirname)
    if (!r) { console.log('typescript-language-server not found, skipping'); return }
    binPath = r.binary
    serverArgs = r.args
    serverInit = {
      ...(r.initialization || {}),
      tsserver: { path: path.join(testDir, 'node_modules', 'typescript', 'lib', 'tsserver.js') },
    }
    console.log('resolved:', binPath)

    const spawnOpts: any = { cwd: testDir, stdio: ['pipe', 'pipe', 'pipe'] }
    if (process.platform === 'win32' && binPath.endsWith('.cmd')) spawnOpts.shell = true
    proc = spawn(binPath, serverArgs, spawnOpts)
    proc.stderr?.on('data', (c: Buffer) => { stderrBuf += c.toString() })

    conn = createMessageConnection(new StreamMessageReader(proc.stdout), new StreamMessageWriter(proc.stdin))

    // Track diagnostic pull registrations (like opencode does)
    conn.onRequest('client/registerCapability', () => null)
    conn.onRequest('client/unregisterCapability', () => null)
    conn.onRequest('workspace/configuration', () => [])
    conn.onRequest('workspace/workspaceFolders', () => [{ name: 'workspace', uri: pathToFileURL(testDir).href }])
    conn.onRequest('window/workDoneProgress/create', () => null)
    conn.onRequest('workspace/diagnostic/refresh', () => null)
    conn.listen()

    // Match opencode's initialize capabilities exactly
    const initResult: any = await conn.sendRequest('initialize', {
      processId: process.pid,
      rootUri: pathToFileURL(testDir + '/').href,
      capabilities: {
        window: { workDoneProgress: true },
        workspace: { configuration: true, didChangeWatchedFiles: { dynamicRegistration: true } },
        textDocument: { synchronization: { didOpen: true, didChange: true }, publishDiagnostics: { versionSupport: false } },
      },
      initializationOptions: serverInit || {},
    })
    expect(initResult.capabilities).toBeTruthy()
    await conn.sendNotification('initialized', {})
    console.log('init ok')
  }, 30000)

  afterAll(() => {
    try { conn?.sendRequest('shutdown') } catch {}
    try { conn?.sendNotification('exit') } catch {}
    setTimeout(() => {
      try { conn?.dispose() } catch {}
      try { proc?.kill() } catch {}
      try { fs.rmSync(testDir, { recursive: true, force: true }) } catch {}
    }, 100)
  })

  test('resolveServer found the binary', () => {
    expect(binPath).toBeTruthy()
  })

  test('server pushes diagnostics for type error', { timeout: 15000 }, async () => {
    if (!conn || !proc) return

    const uri = pathToFileURL(path.join(testDir, 'test.ts')).href

    const diagPromise = new Promise<any[]>((resolve) => {
      conn!.onNotification('textDocument/publishDiagnostics', (params: any) => {
        const serverUri = decodeURIComponent(params.uri).toLowerCase()
        const testUri = uri.toLowerCase()
        if (serverUri === testUri) resolve(params.diagnostics)
      })
    })

    await conn.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId: 'typescript', version: 0, text: 'const x: number = "hello";\n' },
    })

    const diagnostics = await diagPromise
    expect(diagnostics.length).toBeGreaterThan(0)
    const errors = diagnostics.filter((d: any) => d.severity === 1)
    expect(errors.length).toBeGreaterThan(0)
    expect(errors[0].message).toContain("Type 'string'")
  })

  test('server handles workspace symbols', async () => {
    if (!conn || !proc) return

    const uri2 = pathToFileURL(path.join(testDir, 'test2.ts')).href
    fs.writeFileSync(path.join(testDir, 'test2.ts'), 'const y: string = "world";\n')
    await conn.sendNotification('textDocument/didOpen', {
      textDocument: { uri2, languageId: 'typescript', version: 0, text: 'const y: string = "world";\n' },
    })

    const result: any = await conn.sendRequest('workspace/symbol', { query: 'y' })
    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
  })
})
