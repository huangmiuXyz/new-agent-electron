import { z } from 'zod'
import ignore from 'ignore'
import ApplyPatchRender from '../components/ApplyPatchRender.vue'
import { applyUpdateChunks, parsePatchDocument } from './codex-utils'

const MAX_READ_FILES = 5
const AUTO_TRUNCATE_LINE_LIMIT = 1000
const MAX_LIST_RESULTS = 200
const MAX_SEARCH_RESULTS = 300
const MAX_SEARCH_LINE_LENGTH = 500

const getCurrentAgent = () => {
  const chatsStore = useChatsStores()
  const agentStore = useAgentStore()
  const agentId = chatsStore.currentChat?.agentId || 'default'
  return agentStore.getAgentById(agentId) || null
}

const getWorkspaceRoot = (): string => {
  const baseDir = getCurrentAgent()?.terminalStartupPath
  if (!baseDir) {
    throw new Error('未设置 terminalStartupPath，已禁止回退路径解析')
  }
  return window.api.path.resolve(window.api.path.normalize(baseDir))
}

const resolveWorkspacePath = (rawPath: string): string => {
  const baseDir = getWorkspaceRoot()
  const inputPath = rawPath.trim()
  const resolvedPath = window.api.path.isAbsolute(inputPath)
    ? window.api.path.resolve(window.api.path.normalize(inputPath))
    : window.api.path.resolve(baseDir, inputPath)

  const relativePath = window.api.path.relative(baseDir, resolvedPath)
  const isInsideBaseDir =
    relativePath === '' || (!relativePath.startsWith('..') && !window.api.path.isAbsolute(relativePath))

  if (!isInsideBaseDir) {
    throw new Error(`路径越界：仅允许访问 terminalStartupPath 内文件 (${baseDir})`)
  }

  return resolvedPath
}

const toRelativePath = (absolutePath: string) => {
  const baseDir = getWorkspaceRoot()
  const relativePath = window.api.path.relative(baseDir, absolutePath).replaceAll('\\', '/')
  return relativePath || '.'
}

const toolTextResult = (text: string, extra?: Record<string, unknown>) => ({
  ...extra,
  toolResult: {
    content: [{ type: 'text', text }]
  }
})

const countLines = (content: string) => content.split(/\r?\n/).length

const ensureParentDirectory = (filePath: string) => {
  const parentDir = window.api.path.dirname(filePath)
  if (!window.api.fs.existsSync(parentDir)) {
    window.api.fs.mkdirSync(parentDir, { recursive: true })
  }
}

const ensureFile = (filePath: string, action: string) => {
  if (!window.api.fs.existsSync(filePath)) {
    throw new Error(`${action} failed: File not found at path '${toRelativePath(filePath)}'.`)
  }

  const stat = window.api.fs.lstatSync(filePath)
  if ((stat.mode & 0o170000) === 0o040000) {
    throw new Error(`${action} failed: '${toRelativePath(filePath)}' is a directory.`)
  }
}

const truncateLine = (line: string) =>
  line.length > MAX_SEARCH_LINE_LENGTH ? `${line.slice(0, MAX_SEARCH_LINE_LENGTH)}[truncated...]` : line

type IgnoreState = {
  patterns: string[]
  matcher: ReturnType<typeof ignore>
}

const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/',
  '__pycache__/',
  '.git/',
  'dist/',
  'build/',
  'target/',
  'vendor/',
  'bin/',
  'obj/',
  '.idea/',
  '.vscode/',
  '.zig-cache/',
  'zig-out/',
  '.coverage',
  'coverage/',
  'tmp/',
  'temp/',
  '.cache/',
  'cache/',
  'logs/',
  '.venv/',
  'venv/',
  'env/'
]

const rebaseGitignorePatterns = (content: string, dirRelativeToRoot: string): string[] => {
  const baseDir = dirRelativeToRoot.replaceAll('\\', '/').replace(/^\.\/?/, '').replace(/\/$/, '')
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const isNegated = line.startsWith('!')
      const rawPattern = isNegated ? line.slice(1) : line
      if (!baseDir) return line

      let rebasedPattern: string
      if (rawPattern.startsWith('/')) {
        rebasedPattern = `${baseDir}${rawPattern}`
      } else if (rawPattern.includes('/')) {
        rebasedPattern = `${baseDir}/${rawPattern}`
      } else {
        rebasedPattern = `${baseDir}/**/${rawPattern}`
      }

      return isNegated ? `!${rebasedPattern}` : rebasedPattern
    })
}

const createIgnoreState = (rootDir: string, currentDir: string, parentState?: IgnoreState): IgnoreState => {
  const patterns = parentState ? [...parentState.patterns] : [...DEFAULT_IGNORE_PATTERNS]
  const gitignorePath = window.api.path.join(currentDir, '.gitignore')

  if (window.api.fs.existsSync(gitignorePath)) {
    try {
      const content = window.api.fs.readFileSync(gitignorePath, 'utf-8')
      const dirRelativeToRoot = window.api.path.relative(rootDir, currentDir)
      patterns.push(...rebaseGitignorePatterns(content, dirRelativeToRoot))
    } catch {
      // ignore read errors
    }
  }

  return {
    patterns,
    matcher: ignore().add(patterns)
  }
}

const listDirectoryEntries = (rootDir: string, recursive: boolean) => {
  const results: string[] = []
  const rootIgnoreState = createIgnoreState(rootDir, rootDir)

  const walk = (currentDir: string, ignoreState: IgnoreState) => {
    const entries = window.api.fs.readdirSync(currentDir).sort((a, b) => a.localeCompare(b))
    for (const entry of entries) {
      if (results.length >= MAX_LIST_RESULTS) return

      const fullPath = window.api.path.join(currentDir, entry)
      let stat: { mode: number } | null = null
      try {
        stat = window.api.fs.lstatSync(fullPath)
      } catch {
        continue
      }

      const relativePath = window.api.path.relative(rootDir, fullPath).replaceAll('\\', '/')
      const isDirectory = (stat.mode & 0o170000) === 0o040000
      if (
        relativePath &&
        (ignoreState.matcher.ignores(relativePath) || (isDirectory && ignoreState.matcher.ignores(`${relativePath}/`)))
      ) {
        continue
      }

      results.push(isDirectory ? `${relativePath}/` : relativePath)
      if (recursive && isDirectory) {
        walk(fullPath, createIgnoreState(rootDir, fullPath, ignoreState))
      }
    }
  }

  walk(rootDir, rootIgnoreState)
  return results
}

const execCommand = (
  command: string,
  options: { cwd?: string; maxBuffer?: number } = {}
): Promise<{ code: number | null; stdout: string; stderr: string; errorMessage?: string }> => {
  return new Promise((resolve) => {
    window.api.exec(command, options, (error, stdout, stderr) => {
      if (error) {
        resolve({
          code: typeof (error as NodeJS.ErrnoException & { code?: number }).code === 'number' ? (error as NodeJS.ErrnoException & { code?: number }).code! : null,
          stdout,
          stderr,
          errorMessage: error.message
        })
        return
      }

      resolve({
        code: 0,
        stdout,
        stderr
      })
    })
  })
}

const injectBundledRipgrepPath = (command: string): string => {
  const trimmedStart = command.trimStart()
  if (!/^rg(?:\s|$)/.test(trimmedStart)) return command

  const ripgrepPath = window.api.getBundledRipgrepPath()
  if (!ripgrepPath) return command

  const leadingWhitespace = command.slice(0, command.length - trimmedStart.length)
  const rest = trimmedStart.slice(2)
  const quotedRipgrepPath = `"${ripgrepPath.replaceAll('"', '\\"')}"`
  return `${leadingWhitespace}${quotedRipgrepPath}${rest}`
}

const quoteShellArg = (value: string) => `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`

const readSingleFile = (
  rawPath: string,
  options?: { startLine?: number; endLine?: number; autoTruncate?: boolean }
): string => {
  const filePath = resolveWorkspacePath(rawPath)
  ensureFile(filePath, 'read_file')

  const content = window.api.fs.readFileSync(filePath, 'utf-8')
  const lines = content.split(/\r?\n/)
  const startLine = Math.max(1, options?.startLine ?? 1)
  const requestedEndLine = options?.endLine ?? lines.length
  const endLine = Math.min(lines.length, requestedEndLine)

  if (startLine > endLine && lines.length > 0) {
    throw new Error(`read_file failed: Invalid line range ${startLine}-${requestedEndLine} for '${rawPath}'.`)
  }

  let finalEndLine = endLine
  if (options?.autoTruncate && options?.startLine === undefined && options?.endLine === undefined) {
    finalEndLine = Math.min(lines.length, AUTO_TRUNCATE_LINE_LIMIT)
  }

  const selected = lines.slice(startLine - 1, finalEndLine)
  const rendered = selected.map((line, index) => `${startLine + index} | ${line}`).join('\n')
  const truncated = finalEndLine < lines.length
  const suffix = truncated ? `\n[... truncated ${lines.length - finalEndLine} lines ...]` : ''
  return rendered + suffix
}

type DiffBlock = {
  startLine?: number
  endLine?: number
  search: string
  replace: string
}

const parseSearchReplaceDiff = (diff: string): DiffBlock[] => {
  const normalized = diff.replace(/\r\n/g, '\n')
  const pattern = /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g
  const blocks: DiffBlock[] = []

  for (const match of normalized.matchAll(pattern)) {
    const searchSection = match[1] ?? ''
    const replaceSection = match[2] ?? ''
    const searchLines = searchSection.split('\n')
    let startLine: number | undefined
    let endLine: number | undefined
    let delimiterIndex = -1

    for (let i = 0; i < searchLines.length; i += 1) {
      const line = searchLines[i]
      if (line === '-------') {
        delimiterIndex = i
        break
      }
      if (line.startsWith(':start_line:')) {
        startLine = Number.parseInt(line.slice(':start_line:'.length).trim(), 10)
        continue
      }
      if (line.startsWith(':end_line:')) {
        endLine = Number.parseInt(line.slice(':end_line:'.length).trim(), 10)
        continue
      }
    }

    const searchContent =
      delimiterIndex >= 0 ? searchLines.slice(delimiterIndex + 1).join('\n') : searchSection

    blocks.push({
      startLine: Number.isFinite(startLine) ? startLine : undefined,
      endLine: Number.isFinite(endLine) ? endLine : undefined,
      search: searchContent,
      replace: replaceSection
    })
  }

  if (blocks.length === 0) {
    throw new Error('apply_diff failed: No valid SEARCH/REPLACE blocks found.')
  }

  return blocks
}

const applyDiffBlocks = (originalContent: string, blocks: DiffBlock[]): string => {
  let nextContent = originalContent

  for (const block of blocks) {
    const normalizedSearch = block.search.replace(/\r\n/g, '\n')
    const normalizedReplace = block.replace.replace(/\r\n/g, '\n')
    const preferredLineEnding = nextContent.includes('\r\n') ? '\r\n' : '\n'
    const normalizedCurrent = nextContent.replace(/\r\n/g, '\n')

    let replaced = false
    if (block.startLine !== undefined && block.endLine !== undefined) {
      const lines = normalizedCurrent.split('\n')
      const startIndex = Math.max(0, block.startLine - 1)
      const endIndex = Math.min(lines.length, block.endLine)
      const exactRange = lines.slice(startIndex, endIndex).join('\n')

      if (exactRange === normalizedSearch) {
        const replacementLines = normalizedReplace.split('\n')
        lines.splice(startIndex, endIndex - startIndex, ...replacementLines)
        nextContent = lines.join('\n')
        replaced = true
      }
    }

    if (!replaced) {
      const index = normalizedCurrent.indexOf(normalizedSearch)
      if (index === -1) {
        throw new Error('apply_diff failed: Could not find the target SEARCH block in the file.')
      }
      nextContent =
        normalizedCurrent.slice(0, index) +
        normalizedReplace +
        normalizedCurrent.slice(index + normalizedSearch.length)
    }

    if (preferredLineEnding === '\r\n') {
      nextContent = nextContent.replace(/\n/g, '\r\n')
    }
  }

  return nextContent
}

const readFileSchema = z
  .object({
    path: z.string().optional().describe('相对当前工作目录的文件路径'),
    paths: z
      .array(z.string())
      .min(1)
      .max(MAX_READ_FILES)
      .optional()
      .describe(`要读取的一个或多个文件路径，最多 ${MAX_READ_FILES} 个`),
    start_line: z.number().int().min(1).optional().describe('起始行号，1-based'),
    end_line: z.number().int().min(1).optional().describe('结束行号，1-based 且包含该行'),
    auto_truncate: z.boolean().optional().default(true).describe('未指定范围时是否自动截断超大文件')
  })
  .refine((value) => Boolean(value.path || value.paths?.length), {
    message: 'path 或 paths 至少需要提供一个'
  })

export const getCodingBuiltinTools = (): Partial<Tools> => ({
  read_file: {
    title: '读取文件',
    description: '读取一个或多个文件的内容（最多 5 个），参数与 kilocode 的 read_file 兼容。',
    inputSchema: readFileSchema,
    execute: async (args: unknown) => {
      try {
        const params = readFileSchema.parse(args)
        const rawPaths = params.paths?.length ? params.paths : [params.path!]
        if (rawPaths.length > MAX_READ_FILES) {
          return toolTextResult(`read_file failed: You can read at most ${MAX_READ_FILES} files at once.`)
        }

        const sections = rawPaths.map((rawPath) => {
          const content = readSingleFile(rawPath, {
            startLine: params.start_line,
            endLine: params.end_line,
            autoTruncate: params.auto_truncate
          })
          return rawPaths.length === 1 ? content : `# ${rawPath}\n${content}`
        })

        return toolTextResult(sections.join('\n\n'))
      } catch (error) {
        return toolTextResult(`read_file failed: ${(error as Error).message}`)
      }
    }
  },
  write_to_file: {
    title: '写入文件',
    description: '创建新文件或完全覆盖现有文件，参数与 kilocode 的 write_to_file 兼容。',
    inputSchema: z.object({
      path: z.string().describe('相对当前工作目录的文件路径'),
      content: z.string().describe('要写入文件的完整内容'),
      line_count: z.number().int().min(1).describe('文件总行数，包括空行')
    }),
    execute: async (args: unknown) => {
      try {
        const params = args as { path?: string; content?: string; line_count?: number }
        if (!params.path || typeof params.content !== 'string' || typeof params.line_count !== 'number') {
          throw new Error('write_to_file requires path, content, and line_count.')
        }

        const actualLineCount = countLines(params.content)
        if (actualLineCount !== params.line_count) {
          throw new Error(
            `write_to_file failed: line_count mismatch. Expected ${params.line_count}, received ${actualLineCount}.`
          )
        }

        const filePath = resolveWorkspacePath(params.path)
        ensureParentDirectory(filePath)
        window.api.fs.writeFileSync(filePath, params.content, 'utf-8')

        return toolTextResult('Wrote file successfully.', {
          title: toRelativePath(filePath),
          output: 'Wrote file successfully.',
          metadata: {
            filepath: filePath,
            exists: window.api.fs.existsSync(filePath)
          }
        })
      } catch (error) {
        return toolTextResult(`write_to_file failed: ${(error as Error).message}`)
      }
    }
  },
  edit_file: {
    title: '精确编辑文件',
    description: '对现有文件进行精确字符串替换编辑。',
    inputSchema: z.object({
      path: z.string().describe('相对当前工作目录的文件路径'),
      old_string: z.string().describe('要替换的原始字符串'),
      new_string: z.string().describe('新的字符串内容'),
      replace_all: z.boolean().optional().default(false).describe('是否替换所有匹配项，默认 false')
    }),
    execute: async (args: unknown) => {
      try {
        const params = args as {
          path?: string
          old_string?: string
          new_string?: string
          replace_all?: boolean
        }
        if (!params.path || typeof params.old_string !== 'string' || typeof params.new_string !== 'string') {
          throw new Error('edit_file requires path, old_string, and new_string.')
        }
        if (params.old_string === params.new_string) {
          throw new Error('No changes to apply: old_string and new_string are identical.')
        }

        const filePath = resolveWorkspacePath(params.path)
        ensureFile(filePath, 'edit_file')

        const content = window.api.fs.readFileSync(filePath, 'utf-8')
        const occurrences = content.split(params.old_string).length - 1
        if (occurrences === 0) {
          throw new Error('edit_file failed: Could not find old_string in the target file.')
        }

        const nextContent = params.replace_all
          ? content.split(params.old_string).join(params.new_string)
          : content.replace(params.old_string, params.new_string)

        window.api.fs.writeFileSync(filePath, nextContent, 'utf-8')

        return toolTextResult('Edit applied successfully.', {
          title: toRelativePath(filePath),
          output: 'Edit applied successfully.',
          metadata: {
            filepath: filePath,
            replacements: params.replace_all ? occurrences : 1
          }
        })
      } catch (error) {
        return toolTextResult(`edit_file failed: ${(error as Error).message}`)
      }
    }
  },
  apply_diff: {
    title: '应用定向差异',
    description: '使用搜索/替换块对文件进行精确的定向修改。',
    inputSchema: z.object({
      path: z.string().describe('相对当前工作目录的文件路径'),
      diff: z.string().describe('SEARCH/REPLACE diff 内容')
    }),
    render: ApplyPatchRender,
    execute: async (args: unknown) => {
      try {
        const params = args as { path?: string; diff?: string }
        if (!params.path || !params.diff) {
          throw new Error('apply_diff requires path and diff.')
        }

        const filePath = resolveWorkspacePath(params.path)
        ensureFile(filePath, 'apply_diff')
        const originalContent = window.api.fs.readFileSync(filePath, 'utf-8')

        let nextContent: string
        if (params.diff.startsWith('*** Begin Patch')) {
          const operations = parsePatchDocument(params.diff)
          const updateOp = operations.find((item) => item.type === 'update' && item.path === params.path)
          if (!updateOp || updateOp.type !== 'update') {
            throw new Error('apply_diff failed: patch does not contain a matching update operation for the target file.')
          }
          nextContent = applyUpdateChunks(originalContent, updateOp.chunks)
        } else {
          nextContent = applyDiffBlocks(originalContent, parseSearchReplaceDiff(params.diff))
        }

        window.api.fs.writeFileSync(filePath, nextContent, 'utf-8')
        const output = `Success. Updated the following files:\nM ${toRelativePath(filePath)}`

        return toolTextResult(output, {
          title: output,
          output,
          metadata: {
            filepath: filePath
          }
        })
      } catch (error) {
        return toolTextResult(`apply_diff failed: ${(error as Error).message}`)
      }
    }
  },
  delete_file: {
    title: '删除文件',
    description: '删除文件或目录。',
    inputSchema: z.object({
      path: z.string().describe('相对当前工作目录的文件或目录路径')
    }),
    execute: async (args: unknown) => {
      try {
        const params = args as { path?: string }
        if (!params.path) {
          throw new Error('delete_file requires path.')
        }

        const targetPath = resolveWorkspacePath(params.path)
        if (!window.api.fs.existsSync(targetPath)) {
          throw new Error(`File or directory does not exist at path '${params.path}'.`)
        }

        const stat = window.api.fs.lstatSync(targetPath)
        if ((stat.mode & 0o170000) === 0o040000) {
          window.api.fs.rmSync(targetPath, { recursive: true, force: false })
        } else {
          window.api.fs.unlinkSync(targetPath)
        }

        return toolTextResult(`Deleted '${params.path}' successfully.`)
      } catch (error) {
        return toolTextResult(`delete_file failed: ${(error as Error).message}`)
      }
    }
  },
  list_files: {
    title: '列出文件',
    description: '列出目录中的文件和子目录，参数与 kilocode 的 list_files 兼容。',
    inputSchema: z.object({
      path: z.string().describe('相对当前工作目录的目录路径'),
      recursive: z.boolean().optional().default(false).describe('是否递归列出子目录')
    }),
    execute: async (args: unknown) => {
      try {
        const params = args as { path?: string; recursive?: boolean }
        if (!params.path) {
          throw new Error('list_files requires path.')
        }

        const targetPath = resolveWorkspacePath(params.path)
        if (!window.api.fs.existsSync(targetPath)) {
          throw new Error(`Directory not found at path '${params.path}'.`)
        }

        const stat = window.api.fs.lstatSync(targetPath)
        if ((stat.mode & 0o170000) !== 0o040000) {
          throw new Error(`'${params.path}' is not a directory.`)
        }

        const entries = listDirectoryEntries(targetPath, Boolean(params.recursive))
        const truncated = entries.length >= MAX_LIST_RESULTS
        const lines = entries.slice(0, MAX_LIST_RESULTS)
        if (truncated) {
          lines.push(
            `File listing truncated (showing ${MAX_LIST_RESULTS} of ${entries.length} files). Use list_files on specific subdirectories for more details.`
          )
        }

        return toolTextResult(lines.join('\n'))
      } catch (error) {
        return toolTextResult(`list_files failed: ${(error as Error).message}`)
      }
    }
  },
  search_files: {
    title: '搜索文件',
    description: '使用正则表达式在文件中搜索内容，参数与 kilocode 的 search_files 兼容。',
    inputSchema: z.object({
      path: z.string().describe('相对当前工作目录的目录路径'),
      regex: z.string().describe('Rust regex 语法的搜索表达式'),
      file_pattern: z.string().optional().describe('可选 glob 文件过滤，例如 *.ts')
    }),
    execute: async (args: unknown) => {
      try {
        const params = args as { path?: string; regex?: string; file_pattern?: string }
        if (!params.path || !params.regex) {
          throw new Error('search_files requires path and regex.')
        }

        const searchPath = resolveWorkspacePath(params.path)
        const stat = window.api.fs.lstatSync(searchPath)
        if ((stat.mode & 0o170000) !== 0o040000) {
          throw new Error(`'${params.path}' is not a directory.`)
        }

        const rgCommandParts = [
          'rg',
          '--json',
          '--hidden',
          '--no-messages',
          '--line-number',
          '--context',
          '1',
          '--regexp',
          quoteShellArg(params.regex)
        ]

        if (params.file_pattern) {
          rgCommandParts.push('--glob', quoteShellArg(params.file_pattern))
        }
        rgCommandParts.push(quoteShellArg(searchPath))

        const result = await execCommand(injectBundledRipgrepPath(rgCommandParts.join(' ')), {
          cwd: getWorkspaceRoot(),
          maxBuffer: 8 * 1024 * 1024
        })

        const stdout = result.stdout.trim()
        if (!stdout) {
          return toolTextResult('No results found')
        }

        const blocks = new Map<string, Array<{ start: number; end: number }>>()
        const lines = stdout.split(/\r?\n/)
        let matchCount = 0

        for (const line of lines) {
          if (!line.trim()) continue
          let parsed: any
          try {
            parsed = JSON.parse(line)
          } catch {
            continue
          }

          if (parsed.type !== 'match') continue
          const filePath = parsed.data?.path?.text as string | undefined
          const lineNumber = parsed.data?.line_number as number | undefined
          if (!filePath || typeof lineNumber !== 'number') continue

          matchCount += 1
          const nextStart = Math.max(1, lineNumber - 1)
          const nextEnd = lineNumber + 1
          const ranges = blocks.get(filePath) || []
          const previous = ranges[ranges.length - 1]
          if (previous && nextStart <= previous.end + 1) {
            previous.end = Math.max(previous.end, nextEnd)
          } else {
            ranges.push({ start: nextStart, end: nextEnd })
          }
          blocks.set(filePath, ranges)
        }

        if (matchCount === 0) {
          return toolTextResult('No results found')
        }

        const outputLines: string[] = []
        let renderedMatches = 0
        const orderedEntries = Array.from(blocks.entries()).sort((a, b) => a[0].localeCompare(b[0]))

        for (const [filePath, ranges] of orderedEntries) {
          if (renderedMatches >= MAX_SEARCH_RESULTS) break

          const relativePath = toRelativePath(filePath)
          const fileLines = window.api.fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)
          outputLines.push(`# ${relativePath}`)

          for (const range of ranges) {
            if (renderedMatches >= MAX_SEARCH_RESULTS) break
            const end = Math.min(range.end, fileLines.length)
            for (let lineNumber = range.start; lineNumber <= end; lineNumber += 1) {
              outputLines.push(`${String(lineNumber).padStart(3, ' ')} | ${truncateLine(fileLines[lineNumber - 1] ?? '')}`)
            }
            outputLines.push('----')
            renderedMatches += 1
          }

          outputLines.push('')
        }

        if (matchCount > MAX_SEARCH_RESULTS) {
          outputLines.push(
            `# Showing first ${MAX_SEARCH_RESULTS} of ${matchCount}+ results. Use a more specific search if necessary.`
          )
        }

        return toolTextResult(outputLines.join('\n').trim())
      } catch (error) {
        return toolTextResult(`search_files failed: ${(error as Error).message}`)
      }
    }
  }
})
