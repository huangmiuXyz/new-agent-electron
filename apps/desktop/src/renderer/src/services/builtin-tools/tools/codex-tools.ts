import { z } from 'zod'
import ignore from 'ignore'
import ApplyPatchRender from '../components/ApplyPatchRender.vue'
import { applySearchReplace } from './codex-utils'

const getCurrentAgent = () => {
  const chatsStore = useChatsStores()
  const agentStore = useAgentStore()
  const agentId = chatsStore.currentChat?.agentId || 'default'
  return agentStore.getAgentById(agentId) || null
}

const resolvePath = (rawPath: string): string => {
  const baseDir = getCurrentAgent()?.terminalStartupPath
  if (!baseDir) {
    throw new Error('未设置 terminalStartupPath，已禁止回退路径解析')
  }
  const normalizedBaseDir = window.api.path.resolve(window.api.path.normalize(baseDir))
  const inputPath = rawPath.trim()
  const resolvedPath = window.api.path.isAbsolute(inputPath)
    ? window.api.path.resolve(window.api.path.normalize(inputPath))
    : window.api.path.resolve(normalizedBaseDir, inputPath)

  const relativePath = window.api.path.relative(normalizedBaseDir, resolvedPath)
  const isInsideBaseDir =
    relativePath === '' || (!relativePath.startsWith('..') && !window.api.path.isAbsolute(relativePath))

  if (!isInsideBaseDir) {
    throw new Error(`路径越界：仅允许访问 terminalStartupPath 内文件 (${normalizedBaseDir})`)
  }

  return resolvedPath
}

const DEFAULT_EXCLUDE_DIRS = ['node_modules', '.git', 'dist', 'build', 'out', '.turbo']
const MAX_FILE_SIZE_BYTES = 1024 * 1024

type IgnoreState = {
  patterns: string[]
  matcher: ReturnType<typeof ignore>
}

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

const createIgnoreState = (
  rootDir: string,
  currentDir: string,
  parentState?: IgnoreState
): IgnoreState => {
  const patterns = parentState ? [...parentState.patterns] : []
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

const isProbablyBinary = (content: string): boolean => content.includes('\u0000')

const formatContextPreview = (
  lines: string[],
  lineIndex: number,
  contextLines: number,
  highlightStart: number,
  highlightEnd: number,
  maxPreviewChars: number
): string => {
  const truncateLineForPreview = (
    rawLine: string,
    maxChars: number,
    focusStart?: number,
    focusEnd?: number
  ): { text: string; highlightStart: number; highlightEnd: number } => {
    if (rawLine.length <= maxChars) {
      return {
        text: rawLine,
        highlightStart: focusStart ?? -1,
        highlightEnd: focusEnd ?? -1
      }
    }

    const safeMaxChars = Math.max(20, maxChars)
    if (typeof focusStart !== 'number' || typeof focusEnd !== 'number') {
      const text = `${rawLine.slice(0, safeMaxChars - 3)}...`
      return { text, highlightStart: -1, highlightEnd: -1 }
    }

    const focusCenter = Math.floor((focusStart + focusEnd) / 2)
    const maxSliceStart = Math.max(0, rawLine.length - safeMaxChars)
    const sliceStart = Math.min(Math.max(0, focusCenter - Math.floor(safeMaxChars / 2)), maxSliceStart)
    const sliceEnd = Math.min(rawLine.length, sliceStart + safeMaxChars)
    const prefix = sliceStart > 0 ? '...' : ''
    const suffix = sliceEnd < rawLine.length ? '...' : ''
    const text = `${prefix}${rawLine.slice(sliceStart, sliceEnd)}${suffix}`
    const offset = prefix.length - sliceStart

    return {
      text,
      highlightStart: Math.max(0, focusStart + offset),
      highlightEnd: Math.min(text.length, focusEnd + offset)
    }
  }

  const start = Math.max(0, lineIndex - contextLines)
  const end = Math.min(lines.length - 1, lineIndex + contextLines)
  const rendered: string[] = []

  for (let i = start; i <= end; i += 1) {
    const lineNo = i + 1
    const raw = lines[i] ?? ''
    const truncated =
      i === lineIndex
        ? truncateLineForPreview(raw, maxPreviewChars, highlightStart, highlightEnd)
        : truncateLineForPreview(raw, maxPreviewChars)
    const tagged =
      i === lineIndex
        ? `${truncated.text.slice(0, truncated.highlightStart)}[[${truncated.text.slice(
          truncated.highlightStart,
          truncated.highlightEnd
        )}]]${truncated.text.slice(truncated.highlightEnd)}`
        : truncated.text
    rendered.push(`${lineNo} | ${tagged}`)
  }

  return rendered.join('\n')
}

type MatchResult = {
  filePath: string
  line: number
  column: number
  preview: string
}

const searchInFile = (options: {
  content: string
  filePath: string
  query: string
  mode: 'substring' | 'regex'
  caseSensitive: boolean
  contextLines: number
  maxPreviewChars: number
  maxResults: number
  currentResultCount: number
}): MatchResult[] => {
  const {
    content,
    filePath,
    query,
    mode,
    caseSensitive,
    contextLines,
    maxPreviewChars,
    maxResults,
    currentResultCount
  } = options
  const lines = content.split(/\r?\n/)
  const matches: MatchResult[] = []

  if (mode === 'regex') {
    let regex: RegExp
    try {
      regex = new RegExp(query, caseSensitive ? 'g' : 'gi')
    } catch (error) {
      throw new Error(`正则表达式无效: ${(error as Error).message}`)
    }
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? ''
      regex.lastIndex = 0
      let match = regex.exec(line)
      while (match) {
        const start = match.index
        const end = start + (match[0]?.length ?? 0)
        matches.push({
          filePath,
          line: i + 1,
          column: start + 1,
          preview: formatContextPreview(lines, i, contextLines, start, end, maxPreviewChars)
        })
        if (currentResultCount + matches.length >= maxResults) {
          return matches
        }
        if (match[0] === '') {
          regex.lastIndex += 1
        }
        match = regex.exec(line)
      }
    }
    return matches
  }

  const needle = caseSensitive ? query : query.toLowerCase()
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? ''
    const haystack = caseSensitive ? line : line.toLowerCase()
    let from = 0
    while (true) {
      const found = haystack.indexOf(needle, from)
      if (found === -1) break
      matches.push({
        filePath,
        line: i + 1,
        column: found + 1,
        preview: formatContextPreview(
          lines,
          i,
          contextLines,
          found,
          found + needle.length,
          maxPreviewChars
        )
      })
      if (currentResultCount + matches.length >= maxResults) {
        return matches
      }
      from = found + Math.max(needle.length, 1)
    }
  }
  return matches
}

const walkSearchFiles = (rootDir: string, excludeDirs: string[], extensions?: string[]): string[] => {
  const queue: Array<{ dir: string; ignoreState: IgnoreState }> = [
    { dir: rootDir, ignoreState: createIgnoreState(rootDir, rootDir) }
  ]
  const files: string[] = []
  const normalizedExts = extensions?.map((ext) =>
    ext.startsWith('.') ? ext.toLowerCase() : `.${ext.toLowerCase()}`
  )

  while (queue.length > 0) {
    const current = queue.pop()!
    const currentDir = current.dir
    let entries: string[] = []
    try {
      entries = window.api.fs.readdirSync(currentDir) as string[]
    } catch {
      continue
    }

    for (const entryName of entries) {
      const fullPath = window.api.path.join(currentDir, entryName)
      const relativePath = window.api.path.relative(rootDir, fullPath).replaceAll('\\', '/')

      let stat: any
      try {
        stat = window.api.fs.lstatSync(fullPath)
      } catch {
        continue
      }

      const mode = stat.mode & 0o170000
      const isDir = mode === 0o040000
      const isFile = mode === 0o100000
      if (
        relativePath &&
        (current.ignoreState.matcher.ignores(relativePath) ||
          (isDir && current.ignoreState.matcher.ignores(`${relativePath}/`)))
      ) {
        continue
      }

      if (isDir) {
        if (!excludeDirs.includes(entryName)) {
          queue.push({
            dir: fullPath,
            ignoreState: createIgnoreState(rootDir, fullPath, current.ignoreState)
          })
        }
        continue
      }
      if (!isFile) continue

      if (normalizedExts && normalizedExts.length > 0) {
        const ext = window.api.path.extname(entryName).toLowerCase()
        if (!normalizedExts.includes(ext)) continue
      }
      files.push(fullPath)
    }
  }

  return files
}

export const getCodexBuiltinTools = (): Partial<Tools> => ({
  readFile: {
    title: '读取文件',
    description: '读取本地文件内容',
    inputSchema: z.object({
      path: z.string().describe('要读取的文件路径，支持相对路径（基于 terminalStartupPath）或绝对路径'),
      encoding: z.enum(['utf-8']).optional().default('utf-8').describe('文件编码，默认 utf-8')
    }),
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const rawPath = params.path as string

      if (!rawPath) {
        return { toolResult: { content: [{ type: 'text', text: '读取文件失败：path 不能为空' }] } }
      }

      try {
        const filePath = resolvePath(rawPath)
        if (!window.api.fs.existsSync(filePath)) {
          return {
            toolResult: {
              content: [{ type: 'text', text: `读取文件失败：文件不存在 ${filePath}` }]
            }
          }
        }
        const stat = window.api.fs.lstatSync(filePath)
        const isDir = (stat.mode & 0o170000) === 0o040000
        if (isDir) {
          return {
            toolResult: {
              content: [{ type: 'text', text: `读取文件失败：目标是目录而非文件 ${filePath}` }]
            }
          }
        }
        const content = window.api.fs.readFileSync(filePath, 'utf-8')
        return { toolResult: { content: [{ type: 'text', text: content }] } }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `读取文件失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  list_dir: {
    title: '列出目录',
    description: '列出指定目录下的文件和子目录，支持递归深度限制',
    inputSchema: z.object({
      path: z.string().describe('要列出的目录路径，支持相对路径（基于 terminalStartupPath）或绝对路径'),
      max_depth: z
        .number()
        .int()
        .min(1)
        .max(5)
        .optional()
        .default(1)
        .describe('递归深度，默认 1 (仅列出当前目录)，最大 5'),
      max_length: z
        .number()
        .int()
        .min(100)
        .max(10000)
        .optional()
        .default(5000)
        .describe('最大输出字符长度，默认 5000')
    }),
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const rawPath = params.path as string
      const maxDepth = params.max_depth ?? 1
      const maxLength = params.max_length ?? 5000

      if (!rawPath) {
        return { toolResult: { content: [{ type: 'text', text: '列出目录失败：path 不能为空' }] } }
      }

      try {
        const dirPath = resolvePath(rawPath)
        if (!window.api.fs.existsSync(dirPath)) {
          return {
            toolResult: {
              content: [{ type: 'text', text: `列出目录失败：路径不存在 ${dirPath}` }]
            }
          }
        }

        const stat = window.api.fs.lstatSync(dirPath)
        const isDir = (stat.mode & 0o170000) === 0o040000
        if (!isDir) {
          return {
            toolResult: {
              content: [{ type: 'text', text: `列出目录失败：路径不是目录 ${dirPath}` }]
            }
          }
        }

        const results: string[] = []
        let currentLength = 0
        const rootIgnoreState = createIgnoreState(dirPath, dirPath)

        const processDir = (currentPath: string, currentDepth: number, ignoreState: IgnoreState) => {
          if (currentLength >= maxLength) return
          if (currentDepth >= maxDepth) return

          let entries: string[] = []
          try {
            entries = window.api.fs.readdirSync(currentPath)
          } catch (e) {
            const errLine = `${'  '.repeat(currentDepth)}Error: ${(e as Error).message}\n`
            if (currentLength + errLine.length <= maxLength) {
              results.push(errLine)
              currentLength += errLine.length
            }
            return
          }

          // Sort entries: directories first, then files
          entries.sort((a, b) => {
            let aIsDir = false
            let bIsDir = false
            try {
              aIsDir =
                (window.api.fs.lstatSync(window.api.path.join(currentPath, a)).mode & 0o170000) ===
                0o040000
            } catch { }
            try {
              bIsDir =
                (window.api.fs.lstatSync(window.api.path.join(currentPath, b)).mode & 0o170000) ===
                0o040000
            } catch { }
            if (aIsDir && !bIsDir) return -1
            if (!aIsDir && bIsDir) return 1
            return a.localeCompare(b)
          })

          for (const entry of entries) {
            if (currentLength >= maxLength) break

            const fullPath = window.api.path.join(currentPath, entry)
            let isDir = false
            try {
              const s = window.api.fs.lstatSync(fullPath)
              isDir = (s.mode & 0o170000) === 0o040000
            } catch {
              continue
            }
            const relativePath = window.api.path.relative(dirPath, fullPath).replaceAll('\\', '/')
            if (
              relativePath &&
              (ignoreState.matcher.ignores(relativePath) ||
                (isDir && ignoreState.matcher.ignores(`${relativePath}/`)))
            ) {
              continue
            }

            const prefix = isDir ? 'd ' : '- '
            const line = `${'  '.repeat(currentDepth)}${prefix}${entry}\n`

            if (currentLength + line.length > maxLength) {
              results.push('... (output truncated)\n')
              currentLength = maxLength + 1 // Ensure we stop
              return
            }

            results.push(line)
            currentLength += line.length

            if (isDir) {
              processDir(fullPath, currentDepth + 1, createIgnoreState(dirPath, fullPath, ignoreState))
            }
          }
        }

        processDir(dirPath, 0, rootIgnoreState)

        return {
          toolResult: {
            content: [
              { type: 'text', text: `Directory listing for ${dirPath}:\n${results.join('')}` }
            ]
          }
        }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `列出目录失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  search_project: {
    title: '项目全局搜索',
    description: '在项目目录中按关键词进行全局搜索，支持正则、扩展名过滤、排除目录和上下文预览',
    inputSchema: z.object({
      query: z.string().describe('要搜索的关键词或正则表达式'),
      path: z
        .string()
        .optional()
        .default('.')
        .describe('搜索根目录，支持相对路径（基于 terminalStartupPath）或绝对路径'),
      mode: z
        .enum(['substring', 'regex'])
        .optional()
        .default('substring')
        .describe('匹配模式：substring 为普通关键词，regex 为正则表达式'),
      caseSensitive: z.boolean().optional().default(false).describe('是否区分大小写，默认 false'),
      extensions: z
        .array(z.string())
        .optional()
        .describe('可选扩展名过滤，如 [".ts", ".vue", ".md"]；不传表示搜索全部文件'),
      excludeDirs: z
        .array(z.string())
        .optional()
        .default(DEFAULT_EXCLUDE_DIRS)
        .describe(`排除目录名，默认 ${DEFAULT_EXCLUDE_DIRS.join(', ')}`),
      contextLines: z
        .number()
        .int()
        .min(0)
        .max(5)
        .optional()
        .default(1)
        .describe('每条匹配前后展示的上下文行数，范围 0-5，默认 1'),
      maxResults: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .default(50)
        .describe('最大返回条数，范围 1-200，默认 50'),
      maxPreviewChars: z
        .number()
        .int()
        .min(60)
        .max(500)
        .optional()
        .default(200)
        .describe('每行预览的最大字符数，范围 60-500，默认 200')
    }),
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const query = String(params.query || '').trim()
      if (!query) {
        return { toolResult: { content: [{ type: 'text', text: '搜索失败：query 不能为空' }] } }
      }

      try {
        const rootDir = resolvePath(String(params.path || '.'))
        if (!window.api.fs.existsSync(rootDir)) {
          return {
            toolResult: { content: [{ type: 'text', text: `搜索失败：目录不存在 ${rootDir}` }] }
          }
        }

        const stat = window.api.fs.lstatSync(rootDir)
        const isDir = (stat.mode & 0o170000) === 0o040000
        if (!isDir) {
          return {
            toolResult: { content: [{ type: 'text', text: `搜索失败：路径不是目录 ${rootDir}` }] }
          }
        }

        const mode = params.mode === 'regex' ? 'regex' : 'substring'
        const caseSensitive = Boolean(params.caseSensitive)
        const extensions = Array.isArray(params.extensions)
          ? params.extensions.filter((ext: unknown) => typeof ext === 'string' && ext.trim().length > 0)
          : undefined
        const excludeDirs = Array.isArray(params.excludeDirs)
          ? params.excludeDirs.filter((dir: unknown) => typeof dir === 'string' && dir.trim().length > 0)
          : DEFAULT_EXCLUDE_DIRS
        const contextLines =
          typeof params.contextLines === 'number' ? Math.max(0, Math.min(5, params.contextLines)) : 1
        const maxResults =
          typeof params.maxResults === 'number' ? Math.max(1, Math.min(200, params.maxResults)) : 50
        const maxPreviewChars =
          typeof params.maxPreviewChars === 'number'
            ? Math.max(60, Math.min(500, params.maxPreviewChars))
            : 200

        const files = walkSearchFiles(rootDir, excludeDirs, extensions)
        const results: MatchResult[] = []

        for (const filePath of files) {
          if (results.length >= maxResults) break
          try {
            const fileStat = window.api.fs.lstatSync(filePath)
            if (fileStat.size > MAX_FILE_SIZE_BYTES) continue
            const content = window.api.fs.readFileSync(filePath, 'utf-8')
            if (isProbablyBinary(content)) continue

            const matches = searchInFile({
              content,
              filePath,
              query,
              mode,
              caseSensitive,
              contextLines,
              maxPreviewChars,
              maxResults,
              currentResultCount: results.length
            })
            results.push(...matches)
          } catch {
            continue
          }
        }

        if (results.length === 0) {
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text:
                    `未找到匹配结果\nquery: ${query}\npath: ${rootDir}\n` +
                    `excludeDirs: ${excludeDirs.join(', ')}\n扫描文件数: ${files.length}`
                }
              ]
            }
          }
        }

        const output = results
          .slice(0, maxResults)
          .map((item, index) => {
            const relativePath = window.api.path.relative(rootDir, item.filePath) || '.'
            return `#${index + 1} ${relativePath}:${item.line}:${item.column}\n${item.preview}`
          })
          .join('\n\n')

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text:
                  `搜索完成：找到 ${Math.min(results.length, maxResults)} 条结果` +
                  `${results.length >= maxResults ? `（已截断到 ${maxResults} 条）` : ''}\n` +
                  `query: ${query}\npath: ${rootDir}\n` +
                  `excludeDirs: ${excludeDirs.join(', ')}\n扫描文件数: ${files.length}\n\n${output}`
              }
            ]
          }
        }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `搜索失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  exec_command: {
    title: '执行cmd命令',
    description: '执行cmd命令',
    inputSchema: z.object({
      command: z.string().describe('要执行的命令'),
      id: z
        .string()
        .optional()
        .describe('终端ID，默认创建新终端，创建新终端后才可以获得，用户无法提供')
    }),
    needsApproval: true,
    execute: async (args: any, options: any) => {
      const { command, id } = args
      const { createTab } = useTerminal()

      const { id: tabId, result } = await createTab({
        command,
        id,
        toolCallId: options.toolCallId,
        showTerminal: true
      })
      return {
        toolResult: { content: [{ type: 'stdout', text: `终端ID: ${tabId}\n${result!.output}` }] }
      }
    }
  },
  search_replace: {
    title: '搜索和替换',
    description:
      '通过 type 执行文件操作：modify(替换内容)、add(新增文件)、delete(删除文件)、move(移动/重命名文件)。',
    inputSchema: z.object({
      type: z
        .enum(['modify', 'add', 'delete', 'move'])
        .optional()
        .default('modify')
        .describe(
          '操作类型：modify=替换文件内容，add=新增文件，delete=删除文件，move=移动/重命名文件'
        ),
      file_path: z.string().describe('源文件路径（add/delete/modify 为目标文件，move 为原路径）'),
      old_str: z
        .string()
        .optional()
        .describe('type=modify 时必填：要搜索的旧代码片段（必须与文件内容完全匹配）'),
      new_str: z
        .string()
        .optional()
        .describe('type=modify 时为替换内容；type=add 时为新文件内容（可为空字符串）'),
      target_path: z.string().optional().describe('type=move 时必填：目标文件路径'),
      overwrite: z
        .boolean()
        .optional()
        .default(false)
        .describe('type=add 或 move 时可选：目标已存在时是否覆盖，默认 false')
    }),
    render: ApplyPatchRender,
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const type =
        typeof params.type === 'string'
          ? (params.type as 'modify' | 'add' | 'delete' | 'move')
          : 'modify'
      const filePath = typeof params.file_path === 'string' ? params.file_path : ''
      const oldStr = typeof params.old_str === 'string' ? params.old_str : undefined
      const newStr = typeof params.new_str === 'string' ? params.new_str : undefined
      const targetPath = typeof params.target_path === 'string' ? params.target_path : undefined
      const overwrite = Boolean(params.overwrite)

      if (!filePath.trim()) {
        return {
          error: '缺少必要参数: file_path',
          toolResult: {
            content: [{ type: 'text', text: 'search_replace 失败：缺少必要参数 file_path' }]
          }
        }
      }

      const baseDir = getCurrentAgent()?.terminalStartupPath
      if (!baseDir) {
        return {
          error: '未设置 terminalStartupPath',
          toolResult: {
            content: [{ type: 'text', text: 'search_replace 失败：未设置 terminalStartupPath' }]
          }
        }
      }
      try {
        const result = applySearchReplace(
          {
            type,
            filePath,
            oldStr,
            newStr,
            targetPath,
            overwrite
          },
          baseDir
        )
        return {
          summaries: [result],
          toolResult: {
            content: [{ type: 'text', text: result }]
          }
        }
      } catch (error) {
        return {
          error: (error as Error).message,
          toolResult: {
            content: [{ type: 'text', text: `search_replace 失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  }
})
