const resolvePatchPath = (rawPath: string, baseDir: string) => {
  const inputPath = rawPath.trim()
  const noPrefixPath =
    inputPath.startsWith('a/') || inputPath.startsWith('b/') ? inputPath.slice(2) : inputPath
  return window.api.path.isAbsolute(noPrefixPath)
    ? window.api.path.normalize(noPrefixPath)
    : window.api.path.resolve(baseDir, noPrefixPath)
}
const resolvePatchPathInBaseDir = (rawPath: string, baseDir: string) => {
  const targetPath = resolvePatchPath(rawPath, baseDir)
  const normalizedBaseDir = window.api.path.resolve(window.api.path.normalize(baseDir))
  const relativePath = window.api.path.relative(normalizedBaseDir, targetPath)
  const isInsideBaseDir =
    relativePath === '' || (!relativePath.startsWith('..') && !window.api.path.isAbsolute(relativePath))

  if (!isInsideBaseDir) {
    throw new Error(`路径越界：仅允许访问 terminalStartupPath 内文件 (${normalizedBaseDir})`)
  }

  return targetPath
}

type PatchLine = {
  op: ' ' | '+' | '-'
  text: string
}

type PatchChunk = {
  header?: string
  lines: PatchLine[]
  endOfFile?: boolean
}

type ParsedPatchHunk =
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

const normalizePatchText = (patch: string) => patch.replace(/\r\n/g, '\n')

const assertPatchHeader = (patch: string) => {
  if (!patch.startsWith('*** Begin Patch\n')) {
    throw new Error('补丁格式无效：必须以 "*** Begin Patch" 开头')
  }
  if (!(patch.endsWith('\n*** End Patch') || patch.endsWith('\n*** End Patch\n'))) {
    throw new Error('补丁格式无效：必须以 "*** End Patch" 结尾')
  }
}

const parsePatchDocument = (rawPatch: string): ParsedPatchHunk[] => {
  const patch = normalizePatchText(rawPatch)
  assertPatchHeader(patch)

  const lines = patch.split('\n')
  const operations: ParsedPatchHunk[] = []
  let cursor = 1
  let foundEndPatch = false

  const ensurePath = (line: string, prefix: string) => {
    const value = line.slice(prefix.length).trim()
    if (!value) throw new Error(`补丁格式无效：${prefix} 后缺少路径`)
    return value
  }

  while (cursor < lines.length) {
    const line = lines[cursor]

    if (line === '*** End Patch') {
      foundEndPatch = true
      cursor += 1
      break
    }

    if (line === '') {
      cursor += 1
      continue
    }

    if (line.startsWith('*** Add File: ')) {
      const path = ensurePath(line, '*** Add File: ')
      cursor += 1
      const addLines: string[] = []
      while (cursor < lines.length && !lines[cursor].startsWith('*** ')) {
        const current = lines[cursor]
        if (!current.startsWith('+')) {
          throw new Error(`补丁格式无效：Add File 仅允许 '+' 行，实际为 "${current}"`)
        }
        addLines.push(current.slice(1))
        cursor += 1
      }
      if (addLines.length === 0) {
        throw new Error(`补丁格式无效：Add File(${path}) 至少需要一行 '+' 内容`)
      }
      operations.push({ type: 'add', path, lines: addLines })
      continue
    }

    if (line.startsWith('*** Delete File: ')) {
      const path = ensurePath(line, '*** Delete File: ')
      operations.push({ type: 'delete', path })
      cursor += 1
      continue
    }

    if (line.startsWith('*** Update File: ')) {
      const path = ensurePath(line, '*** Update File: ')
      cursor += 1

      let moveTo: string | undefined
      if (cursor < lines.length && lines[cursor].startsWith('*** Move to: ')) {
        moveTo = ensurePath(lines[cursor], '*** Move to: ')
        cursor += 1
      }

      const chunks: PatchChunk[] = []
      let currentChunk: PatchChunk | null = null

      while (cursor < lines.length) {
        const current = lines[cursor]
        if (current.startsWith('*** ')) break

        if (current === '*** End of File') {
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
          currentChunk.lines.push({ op: current[0] as PatchLine['op'], text: current.slice(1) })
          cursor += 1
          continue
        }

        throw new Error(`补丁格式无效：无法解析 Update File(${path}) 中的行 "${current}"`)
      }

      operations.push({ type: 'update', path, moveTo, chunks })
      continue
    }

    throw new Error(`补丁格式无效：未知区块头 "${line}"`)
  }

  if (!foundEndPatch) {
    throw new Error('补丁格式无效：未找到 "*** End Patch"')
  }

  while (cursor < lines.length) {
    if (lines[cursor] !== '') {
      throw new Error(`补丁格式无效：结束标记后存在多余内容 "${lines[cursor]}"`)
    }
    cursor += 1
  }

  if (operations.length === 0) {
    throw new Error('补丁格式无效：至少需要一个文件操作区块')
  }

  return operations
}

const findBlockIndex = (contentLines: string[], block: string[], from: number): number => {
  if (block.length === 0) return Math.min(from, contentLines.length)

  const findInRange = (start: number) => {
    for (let i = start; i <= contentLines.length - block.length; i += 1) {
      let match = true
      for (let j = 0; j < block.length; j += 1) {
        if (contentLines[i + j] !== block[j]) {
          match = false
          break
        }
      }
      if (match) return i
    }
    return -1
  }

  const fromIndex = Math.max(0, Math.min(from, contentLines.length))
  const strictMatch = findInRange(fromIndex)
  if (strictMatch !== -1) return strictMatch

  return fromIndex > 0 ? findInRange(0) : -1
}

const applyUpdateChunks = (original: string, chunks: PatchChunk[]): string => {
  const normalizedOriginal = normalizePatchText(original)
  const lines = normalizedOriginal.split('\n')
  let cursor = 0

  for (const chunk of chunks) {
    if (chunk.lines.length === 0) continue

    const oldBlock = chunk.lines.filter((item) => item.op !== '+').map((item) => item.text)
    const newBlock = chunk.lines.filter((item) => item.op !== '-').map((item) => item.text)
    const matchIndex = findBlockIndex(lines, oldBlock, cursor)

    if (matchIndex === -1) {
      const marker = chunk.header ? ` (@@ ${chunk.header})` : ''
      throw new Error(`补丁应用失败：未找到可替换片段${marker}`)
    }

    lines.splice(matchIndex, oldBlock.length, ...newBlock)
    cursor = matchIndex + newBlock.length
  }

  const preferredEol = original.includes('\r\n') ? '\r\n' : '\n'
  const updated = lines.join('\n')
  return preferredEol === '\r\n' ? updated.replace(/\n/g, '\r\n') : updated
}

const ensureTargetParentDir = (filePath: string) => {
  const parentDir = window.api.path.dirname(filePath)
  if (!window.api.fs.existsSync(parentDir)) {
    window.api.fs.mkdirSync(parentDir, { recursive: true })
  }
}

const ensureFilePath = (filePath: string, operation: string) => {
  if (!window.api.fs.existsSync(filePath)) {
    throw new Error(`${operation} 失败：文件不存在 ${filePath}`)
  }
  const stat = window.api.fs.lstatSync(filePath)
  if ((stat.mode & 0o170000) === 0o040000) {
    throw new Error(`${operation} 失败：目标是目录 ${filePath}`)
  }
}

export const applySearchReplace = (
  filePath: string,
  oldStr: string,
  newStr: string,
  baseDir: string
): string => {
  const targetPath = resolvePatchPath(filePath, baseDir)
  if (!window.api.fs.existsSync(targetPath)) {
    throw new Error(`文件不存在: ${targetPath}`)
  }
  const stat = window.api.fs.lstatSync(targetPath)
  if ((stat.mode & 0o170000) === 0o040000) {
    throw new Error(`目标是目录，无法编辑: ${targetPath}`)
  }

  const content = window.api.fs.readFileSync(targetPath, 'utf-8')

  const normalize = (s: string) => s.replace(/\r\n/g, '\n')
  const normalizedContent = normalize(content)
  const normalizedOldStr = normalize(oldStr)

  const index = normalizedContent.indexOf(normalizedOldStr)

  if (index === -1) {
    throw new Error(`在文件中未找到匹配的旧代码片段 (old_str)。请确保 old_str 与文件中的现有代码完全匹配（包括空格和换行）。`)
  }

  if (content.includes(oldStr)) {
      const newContent = content.replace(oldStr, newStr)
      window.api.fs.writeFileSync(targetPath, newContent, 'utf-8')
      return `Successfully replaced content in ${targetPath}`
  }

  if (index !== -1) {
      const newContent = normalizedContent.replace(normalizedOldStr, normalize(newStr))
      window.api.fs.writeFileSync(targetPath, newContent, 'utf-8')
      return `Successfully replaced content in ${targetPath} (normalized line endings)`
  }

  throw new Error(`在文件中未找到匹配的旧代码片段 (old_str)。请确保 old_str 与文件中的现有代码完全匹配（包括空格和换行）。`)
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
