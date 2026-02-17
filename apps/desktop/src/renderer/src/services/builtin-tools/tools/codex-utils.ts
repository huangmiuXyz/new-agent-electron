const resolvePatchPath = (rawPath: string, baseDir: string) => {
  const inputPath = rawPath.trim()
  const noPrefixPath =
    inputPath.startsWith('a/') || inputPath.startsWith('b/') ? inputPath.slice(2) : inputPath
  return window.api.path.isAbsolute(noPrefixPath)
    ? window.api.path.normalize(noPrefixPath)
    : window.api.path.resolve(baseDir, noPrefixPath)
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
