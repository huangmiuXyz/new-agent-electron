const PATCH_BEGIN = '*** Begin Patch'
const PATCH_END = '*** End Patch'
const PATCH_ADD_FILE = '*** Add File: '
const PATCH_DELETE_FILE = '*** Delete File: '
const PATCH_UPDATE_FILE = '*** Update File: '
const PATCH_MOVE_TO = '*** Move to: '
const PATCH_END_OF_FILE = '*** End of File'

type PatchLine = {
  op: ' ' | '+' | '-'
  text: string
}

type PatchChunk = {
  header?: string
  lines: PatchLine[]
  endOfFile?: boolean
}

type ParsedPatchAction =
  | {
      type: 'add'
      path: string
      lines: string[]
    }
  | {
      type: 'delete'
      path: string
    }
  | {
      type: 'update'
      path: string
      moveTo?: string
      chunks: PatchChunk[]
    }

type Snapshot = {
  exists: boolean
  content?: string
}

const normalizeTextForPatch = (value: string) => value.replace(/\r\n/g, '\n')

const splitFileByLine = (content: string) => {
  const eol = content.includes('\r\n') ? '\r\n' : '\n'
  const normalized = normalizeTextForPatch(content)
  const hasTrailingNewline = normalized.endsWith('\n')
  const lines = normalized.length > 0 ? normalized.split('\n') : []

  if (hasTrailingNewline && lines.length > 0) {
    lines.pop()
  }

  return {
    lines,
    eol,
    hasTrailingNewline
  }
}

const joinFileLines = (lines: string[], eol: string, hasTrailingNewline: boolean) => {
  const joined = lines.join(eol)
  return hasTrailingNewline ? `${joined}${eol}` : joined
}

const resolvePatchPath = (rawPath: string, baseDir: string) => {
  const inputPath = rawPath.trim()
  const noPrefixPath =
    inputPath.startsWith('a/') || inputPath.startsWith('b/') ? inputPath.slice(2) : inputPath
  return window.api.path.isAbsolute(noPrefixPath)
    ? window.api.path.normalize(noPrefixPath)
    : window.api.path.resolve(baseDir, noPrefixPath)
}

const findLineSequence = (source: string[], target: string[], startIndex: number) => {
  if (target.length === 0) return startIndex
  const maxStart = source.length - target.length
  for (let i = startIndex; i <= maxStart; i += 1) {
    let matched = true
    for (let j = 0; j < target.length; j += 1) {
      if (source[i + j] !== target[j]) {
        matched = false
        break
      }
    }
    if (matched) return i
  }
  return -1
}

const applyChunksToLines = (sourceLines: string[], chunks: PatchChunk[], filePath: string) => {
  const result: string[] = []
  let sourceCursor = 0

  for (const chunk of chunks) {
    const expectedOldLines = chunk.lines.filter((line) => line.op !== '+').map((line) => line.text)
    let chunkStart = -1

    if (expectedOldLines.length === 0) {
      if (chunk.endOfFile) {
        chunkStart = sourceLines.length
      } else if (chunk.header) {
        const anchor = sourceLines.findIndex(
          (line, index) => index >= sourceCursor && line === chunk.header
        )
        chunkStart = anchor >= 0 ? anchor : sourceCursor
      } else {
        chunkStart = sourceCursor
      }
    } else {
      chunkStart = findLineSequence(sourceLines, expectedOldLines, sourceCursor)
      if (chunkStart < 0 && chunk.header) {
        const anchor = sourceLines.findIndex(
          (line, index) => index >= sourceCursor && line === chunk.header
        )
        if (anchor >= 0) {
          chunkStart = findLineSequence(sourceLines, expectedOldLines, anchor)
        }
      }
      if (chunkStart < 0) {
        throw new Error(`找不到可应用 hunk 的位置: ${filePath}`)
      }
    }

    result.push(...sourceLines.slice(sourceCursor, chunkStart))
    let readIndex = chunkStart

    for (const line of chunk.lines) {
      if (line.op === '+') {
        result.push(line.text)
        continue
      }

      const current = sourceLines[readIndex]
      if (current !== line.text) {
        throw new Error(
          `hunk 与文件内容不匹配: ${filePath} (期望 "${line.text}"，实际 "${current ?? '<EOF>'}")`
        )
      }

      if (line.op === ' ') {
        result.push(line.text)
      }
      readIndex += 1
    }

    sourceCursor = readIndex
  }

  result.push(...sourceLines.slice(sourceCursor))
  return result
}

const parsePatch = (patch: string): ParsedPatchAction[] => {
  const lines = normalizeTextForPatch(patch).split('\n')

  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }

  if (lines[0] !== PATCH_BEGIN) {
    throw new Error(`patch 必须以 "${PATCH_BEGIN}" 开始`)
  }

  if (lines[lines.length - 1] !== PATCH_END) {
    throw new Error(`patch 必须以 "${PATCH_END}" 结束`)
  }

  let cursor = 1
  const actions: ParsedPatchAction[] = []

  while (cursor < lines.length - 1) {
    const line = lines[cursor]

    if (line.startsWith(PATCH_ADD_FILE)) {
      const path = line.slice(PATCH_ADD_FILE.length)
      if (!path) throw new Error('Add File 缺少路径')
      cursor += 1
      const addLines: string[] = []

      while (cursor < lines.length - 1) {
        const current = lines[cursor]
        if (current.startsWith('*** ')) break
        if (!current.startsWith('+')) {
          throw new Error(`Add File 只允许 "+" 行: ${path}`)
        }
        addLines.push(current.slice(1))
        cursor += 1
      }

      if (addLines.length === 0) {
        throw new Error(`Add File 至少需要一行内容: ${path}`)
      }

      actions.push({ type: 'add', path, lines: addLines })
      continue
    }

    if (line.startsWith(PATCH_DELETE_FILE)) {
      const path = line.slice(PATCH_DELETE_FILE.length)
      if (!path) throw new Error('Delete File 缺少路径')
      actions.push({ type: 'delete', path })
      cursor += 1
      continue
    }

    if (line.startsWith(PATCH_UPDATE_FILE)) {
      const path = line.slice(PATCH_UPDATE_FILE.length)
      if (!path) throw new Error('Update File 缺少路径')
      cursor += 1

      let moveTo: string | undefined
      if (cursor < lines.length - 1 && lines[cursor].startsWith(PATCH_MOVE_TO)) {
        moveTo = lines[cursor].slice(PATCH_MOVE_TO.length)
        if (!moveTo) throw new Error(`Move to 缺少目标路径: ${path}`)
        cursor += 1
      }

      const chunks: PatchChunk[] = []
      let currentChunk: PatchChunk | null = null

      while (cursor < lines.length - 1) {
        const current = lines[cursor]
        if (
          current === PATCH_END ||
          current.startsWith(PATCH_ADD_FILE) ||
          current.startsWith(PATCH_DELETE_FILE) ||
          current.startsWith(PATCH_UPDATE_FILE)
        ) {
          break
        }

        if (current === PATCH_END_OF_FILE) {
          if (!currentChunk) {
            currentChunk = { lines: [] }
            chunks.push(currentChunk)
          }
          currentChunk.endOfFile = true
          cursor += 1
          continue
        }

        if (current === '@@' || current.startsWith('@@ ')) {
          currentChunk = {
            header: current === '@@' ? undefined : current.slice(3),
            lines: []
          }
          chunks.push(currentChunk)
          cursor += 1
          continue
        }

        if (current.startsWith(' ') || current.startsWith('+') || current.startsWith('-')) {
          if (!currentChunk) {
            currentChunk = { lines: [] }
            chunks.push(currentChunk)
          }
          currentChunk.lines.push({
            op: current[0] as PatchLine['op'],
            text: current.slice(1)
          })
          cursor += 1
          continue
        }

        throw new Error(`无法解析 update hunk 行: ${current}`)
      }

      if (!moveTo && chunks.length === 0) {
        throw new Error(`Update File 缺少变更内容: ${path}`)
      }

      actions.push({ type: 'update', path, moveTo, chunks })
      continue
    }

    throw new Error(`无法解析 patch hunk: ${line}`)
  }

  if (actions.length === 0) {
    throw new Error('patch 中没有可执行的 hunk')
  }

  return actions
}

const createSnapshot = (snapshots: Map<string, Snapshot>, filePath: string) => {
  if (snapshots.has(filePath)) return

  if (!window.api.fs.existsSync(filePath)) {
    snapshots.set(filePath, { exists: false })
    return
  }

  const stat = window.api.fs.lstatSync(filePath)
  if ((stat.mode & 0o170000) === 0o040000) {
    throw new Error(`目标路径是目录，无法作为文件编辑: ${filePath}`)
  }

  snapshots.set(filePath, {
    exists: true,
    content: window.api.fs.readFileSync(filePath, 'utf-8')
  })
}

const rollbackSnapshots = (snapshots: Map<string, Snapshot>) => {
  const entries = Array.from(snapshots.entries()).reverse()
  for (const [filePath, snapshot] of entries) {
    if (snapshot.exists) {
      window.api.fs.mkdirSync(window.api.path.dirname(filePath), { recursive: true })
      window.api.fs.writeFileSync(filePath, snapshot.content ?? '', 'utf-8')
      continue
    }
    if (window.api.fs.existsSync(filePath)) {
      const stat = window.api.fs.lstatSync(filePath)
      if ((stat.mode & 0o170000) !== 0o040000) {
        window.api.fs.unlinkSync(filePath)
      }
    }
  }
}

export const applyPatchActions = (patch: string, baseDir: string) => {
  const actions = parsePatch(patch)
  const snapshots = new Map<string, Snapshot>()
  const summaries: string[] = []

  try {
    for (const action of actions) {
      if (action.type === 'add') {
        const targetPath = resolvePatchPath(action.path, baseDir)
        if (window.api.fs.existsSync(targetPath)) {
          throw new Error(`Add File 失败，文件已存在: ${targetPath}`)
        }
        createSnapshot(snapshots, targetPath)
        window.api.fs.mkdirSync(window.api.path.dirname(targetPath), { recursive: true })
        window.api.fs.writeFileSync(targetPath, `${action.lines.join('\n')}\n`, 'utf-8')
        summaries.push(`Added: ${targetPath}`)
        continue
      }

      if (action.type === 'delete') {
        const targetPath = resolvePatchPath(action.path, baseDir)
        if (!window.api.fs.existsSync(targetPath)) {
          throw new Error(`Delete File 失败，文件不存在: ${targetPath}`)
        }
        const stat = window.api.fs.lstatSync(targetPath)
        if ((stat.mode & 0o170000) === 0o040000) {
          throw new Error(`Delete File 失败，目标是目录: ${targetPath}`)
        }
        createSnapshot(snapshots, targetPath)
        window.api.fs.unlinkSync(targetPath)
        summaries.push(`Deleted: ${targetPath}`)
        continue
      }

      const sourcePath = resolvePatchPath(action.path, baseDir)
      if (!window.api.fs.existsSync(sourcePath)) {
        throw new Error(`Update File 失败，文件不存在: ${sourcePath}`)
      }
      const sourceStat = window.api.fs.lstatSync(sourcePath)
      if ((sourceStat.mode & 0o170000) === 0o040000) {
        throw new Error(`Update File 失败，目标是目录: ${sourcePath}`)
      }

      const sourceContent = window.api.fs.readFileSync(sourcePath, 'utf-8')
      const sourceMeta = splitFileByLine(sourceContent)
      const updatedLines = applyChunksToLines(sourceMeta.lines, action.chunks, sourcePath)
      const updatedContent = joinFileLines(
        updatedLines,
        sourceMeta.eol,
        sourceMeta.hasTrailingNewline
      )

      if (action.moveTo) {
        const targetPath = resolvePatchPath(action.moveTo, baseDir)
        if (targetPath !== sourcePath && window.api.fs.existsSync(targetPath)) {
          throw new Error(`Move 失败，目标文件已存在: ${targetPath}`)
        }
        createSnapshot(snapshots, sourcePath)
        createSnapshot(snapshots, targetPath)
        window.api.fs.mkdirSync(window.api.path.dirname(targetPath), { recursive: true })
        window.api.fs.writeFileSync(targetPath, updatedContent, 'utf-8')
        if (targetPath !== sourcePath) {
          window.api.fs.unlinkSync(sourcePath)
          summaries.push(`Moved: ${sourcePath} -> ${targetPath}`)
        } else {
          summaries.push(`Updated: ${sourcePath}`)
        }
        continue
      }

      createSnapshot(snapshots, sourcePath)
      window.api.fs.writeFileSync(sourcePath, updatedContent, 'utf-8')
      summaries.push(`Updated: ${sourcePath}`)
    }

    return summaries
  } catch (error) {
    rollbackSnapshots(snapshots)
    throw error
  }
}

const READ_ONLY_COMMANDS = new Set([
  'cat',
  'cut',
  'echo',
  'file',
  'find',
  'git',
  'grep',
  'head',
  'ls',
  'nl',
  'pwd',
  'printf',
  'readlink',
  'realpath',
  'rg',
  'sed',
  'sort',
  'stat',
  'tail',
  'tr',
  'uniq',
  'wc',
  'which'
])

const READ_ONLY_GIT_SUBCOMMANDS = new Set([
  'blame',
  'branch',
  'describe',
  'diff',
  'grep',
  'log',
  'ls-files',
  'remote',
  'rev-parse',
  'show',
  'status'
])

const truncateByTokens = (value: string, maxOutputTokens = 2000) => {
  const safeTokens =
    Number.isFinite(maxOutputTokens) && maxOutputTokens > 0 ? maxOutputTokens : 2000
  const maxChars = Math.max(256, Math.min(safeTokens * 4, 200000))
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}\n...[truncated ${value.length - maxChars} chars]`
}

export const validateReadOnlyCommand = (
  command: string
): { ok: true } | { ok: false; reason: string } => {
  if (!command || !command.trim()) {
    return { ok: false, reason: '命令不能为空' }
  }
  if (/>|<<|<<</.test(command)) {
    return { ok: false, reason: '不允许使用重定向写入命令' }
  }
  if (/`|\$\(/.test(command)) {
    return { ok: false, reason: '不允许使用命令替换，避免隐式写入' }
  }

  const segments = command
    .split(/\|\||&&|[|;]/)
    .map((item) => item.trim())
    .filter(Boolean)
  if (segments.length === 0) {
    return { ok: false, reason: '命令解析失败' }
  }

  for (const segment of segments) {
    const cleaned = segment.replace(/^!+/, '').replace(/^\(+/, '').trim()
    const baseMatch = cleaned.match(/^([A-Za-z0-9._-]+)/)
    if (!baseMatch) {
      return { ok: false, reason: `无法识别命令: ${segment}` }
    }
    const baseCommand = baseMatch[1]
    if (!READ_ONLY_COMMANDS.has(baseCommand)) {
      return { ok: false, reason: `仅允许只读命令，禁止: ${baseCommand}` }
    }
    if (baseCommand === 'git') {
      const subCommand = cleaned.match(/^git\s+([A-Za-z0-9._-]+)/)?.[1]
      if (!subCommand || !READ_ONLY_GIT_SUBCOMMANDS.has(subCommand)) {
        return { ok: false, reason: `git 子命令不在只读白名单中: ${subCommand || '<empty>'}` }
      }
    }
    if (baseCommand === 'sed' && /\s-i(\s|$)/.test(cleaned)) {
      return { ok: false, reason: 'sed -i 会写入文件，已禁止' }
    }
  }
  return { ok: true }
}

export const runParallelExec = (args: {
  cmd: string
  workdir?: string
  shell?: string
  yield_time_ms?: number
  max_output_tokens?: number
}) => {
  const timeout = Math.min(Math.max(args.yield_time_ms ?? 30000, 500), 300000)
  const maxBuffer = 8 * 1024 * 1024

  return new Promise<{
    ok: boolean
    exitCode: number
    stdout: string
    stderr: string
    error?: string
  }>((resolve) => {
    window.api.exec(
      args.cmd,
      {
        cwd: args.workdir,
        shell: args.shell || window.api.process.env.SHELL,
        timeout,
        maxBuffer
      },
      (error, stdout, stderr) => {
        const safeStdout = truncateByTokens(stdout || '', args.max_output_tokens)
        const safeStderr = truncateByTokens(stderr || '', args.max_output_tokens)
        if (error) {
          const code = typeof (error as any).code === 'number' ? (error as any).code : 1
          resolve({
            ok: false,
            exitCode: code,
            stdout: safeStdout,
            stderr: safeStderr,
            error: (error as Error).message
          })
          return
        }
        resolve({ ok: true, exitCode: 0, stdout: safeStdout, stderr: safeStderr })
      }
    )
  })
}
