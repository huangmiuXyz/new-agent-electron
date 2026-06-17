import { z } from 'zod'
import ignore from 'ignore'
import { getDedicatedFileToolHint, injectBundledRipgrepPath } from './command-utils'
import ReadFileRender from '../components/codex/ReadFileRender.vue'
import SearchProjectRender from '../components/codex/SearchProjectRender.vue'
import EditFileRender from '../components/codex/EditFileRender.vue'
import ListDirRender from '../components/codex/ListDirRender.vue'
import ChangeWorkingDirectoryRender from '../components/codex/ChangeWorkingDirectoryRender.vue'

type CodexToolExecuteOptions = {
  chatId?: string
  toolCallId?: string
  availableBuiltinTools?: string[]
}

type CodexBuiltinToolsOptions = {
  editFileMode?: 'hashline' | 'replace' | 'patch'
}

const getCurrentAgent = (chatId?: string) => {
  const chatsStore = useChatsStores()
  const agentStore = useAgentStore()
  const agentId =
    chatsStore.getChatById(chatId || '')?.agentId || chatsStore.currentChat?.agentId || 'default'
  return agentStore.getAgentById(agentId) || null
}

const getCurrentWorkPath = (chatId?: string) => {
  return useCanvasStore().getWorkPath(chatId)
}

const getAvailableBuiltinToolSet = (options?: CodexToolExecuteOptions): Set<string> | null => {
  if (Array.isArray(options?.availableBuiltinTools)) {
    return new Set(options.availableBuiltinTools)
  }

  const currentAgent = getCurrentAgent(options?.chatId)
  return currentAgent?.builtinTools ? new Set(currentAgent.builtinTools) : null
}

const isBuiltinToolAvailable = (availableTools: Set<string> | null, toolName: string): boolean =>
  !availableTools || availableTools.has(toolName)

const resolveWorkspaceRootPath = (rawPath: string, chatId?: string): string => {
  const inputPath = rawPath.trim()
  if (!inputPath) {
    throw new Error('path 不能为空')
  }

  const currentWorkPath = getCurrentWorkPath(chatId)
  const resolvedPath = window.api.path.isAbsolute(inputPath)
    ? window.api.path.resolve(window.api.path.normalize(inputPath))
    : currentWorkPath
      ? window.api.path.resolve(window.api.path.normalize(currentWorkPath), inputPath)
      : window.api.path.resolve(window.api.path.normalize(inputPath))

  if (!window.api.fs.existsSync(resolvedPath)) {
    throw new Error(`路径不存在：${resolvedPath}`)
  }

  const stat = window.api.fs.lstatSync(resolvedPath)
  const isDir = (stat.mode & 0o170000) === 0o040000
  if (!isDir) {
    throw new Error(`路径不是目录：${resolvedPath}`)
  }

  return resolvedPath
}

const resolvePath = (rawPath: string, chatId?: string): string => {
  const baseDir = getCurrentWorkPath(chatId)
  if (!baseDir) {
    throw new Error(
      '未设置 workPath，已禁止回退路径解析，优先使用 `change_working_directory` 工具临时设置，禁止使用 exec_command 执行文件操作'
    )
  }
  const normalizedBaseDir = window.api.path.resolve(window.api.path.normalize(baseDir))
  const inputPath = rawPath.trim()
  const resolvedPath = window.api.path.isAbsolute(inputPath)
    ? window.api.path.resolve(window.api.path.normalize(inputPath))
    : window.api.path.resolve(normalizedBaseDir, inputPath)

  const relativePath = window.api.path.relative(normalizedBaseDir, resolvedPath)
  const isInsideBaseDir =
    relativePath === '' ||
    (!relativePath.startsWith('..') && !window.api.path.isAbsolute(relativePath))

  if (!isInsideBaseDir) {
    throw new Error(`路径越界：仅允许访问 workPath 内文件 (${normalizedBaseDir})`)
  }

  return resolvedPath
}

type IgnoreState = {
  patterns: string[]
  matcher: ReturnType<typeof ignore>
}

const rebaseGitignorePatterns = (content: string, dirRelativeToRoot: string): string[] => {
  const baseDir = dirRelativeToRoot
    .replaceAll('\\', '/')
    .replace(/^\.\/?/, '')
    .replace(/\/$/, '')
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

const getPowerShellPath = (): string => {
  const systemRoot = window.api.process.env.SystemRoot
  return systemRoot
    ? window.api.path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'
}

const getPosixShellPath = (): string => window.api.process.env.SHELL || '/bin/sh'

const execProjectSearchCommand = async (
  command: string,
  options: { cwd?: string; maxBuffer?: number } = {}
): Promise<{
  code: number | null
  stdout: string
  stderr: string
  errorMessage?: string
  errorCode?: string
}> => {
  if (!isWindowsPlatform()) {
    return window.api.execFileCommand(getPosixShellPath(), ['-lc', command], options)
  }

  return window.api.execFileCommand(
    getPowerShellPath(),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    options
  )
}

const isWindowsPlatform = (): boolean => navigator.platform.toLowerCase().includes('win')
const startsWithRipgrep = (command: string): boolean => /^rg(?:\s|$)/.test(command.trimStart())
const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined
const SEARCH_OUTPUT_PREVIEW_LINE_LIMIT = 160
const SEARCH_OUTPUT_PREVIEW_CHAR_LIMIT = 30000
const SEARCH_CANDIDATE_FILE_LIMIT = 20
const SEARCH_REFINE_FILE_THRESHOLD = 12
const TOOL_OUTPUT_CHAR_LIMIT = 30000

type SearchHit = {
  path: string
  line?: number
  text: string
}

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text
  const marker = `\n... (output truncated, ${text.length - maxLength} chars omitted)`
  if (marker.length >= maxLength) return text.slice(0, maxLength)
  return `${text.slice(0, maxLength - marker.length)}${marker}`
}

const truncateLinesAndText = (text: string, maxLines: number, maxLength: number): string => {
  const lines = text.split(/\r?\n/)
  const truncatedByLines = lines.length > maxLines
  const lineLimited = truncatedByLines ? lines.slice(0, maxLines).join('\n') : text
  const truncated = truncateText(lineLimited, maxLength)
  return truncatedByLines
    ? `${truncated}\n... (output truncated, ${lines.length - maxLines} lines omitted)`
    : truncated
}

const stripAnsiCodes = (text: string): string =>
  text.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')

const parseSearchHits = (stdout: string): SearchHit[] => {
  return stdout
    .split(/\r?\n/)
    .map((line) => stripAnsiCodes(line).trimEnd())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^(.+?):(\d+)(?::\d+)?:(.*)$/)
      if (match) {
        return {
          path: match[1],
          line: Number(match[2]),
          text: match[3].trim()
        }
      }

      return {
        path: line,
        text: ''
      }
    })
}

const buildSearchSummary = (stdout: string): string => {
  const hits = parseSearchHits(stdout)
  if (hits.length === 0) return ''

  const byFile = new Map<string, { count: number; lines: number[]; preview: string }>()
  for (const hit of hits) {
    const entry = byFile.get(hit.path) || { count: 0, lines: [], preview: '' }
    entry.count += 1
    if (typeof hit.line === 'number' && entry.lines.length < 8) {
      entry.lines.push(hit.line)
    }
    if (!entry.preview && hit.text) {
      entry.preview = hit.text
    }
    byFile.set(hit.path, entry)
  }

  const files = Array.from(byFile.entries())
  const candidateLines = files.slice(0, SEARCH_CANDIDATE_FILE_LIMIT).map(([path, entry], index) => {
    const lineHint = entry.lines.length > 0 ? ` lines: ${entry.lines.join(', ')}` : ''
    const preview = entry.preview ? ` first_match: ${entry.preview.slice(0, 180)}` : ''
    return `${index + 1}. ${path} (${entry.count} match${entry.count === 1 ? '' : 'es'}${lineHint})${preview}`
  })

  const refineHint =
    files.length > SEARCH_REFINE_FILE_THRESHOLD
      ? [
          '',
          'next_step:',
          `- Search matched ${files.length} files. Refine with a narrower path, glob, symbol, or --max-count before reading files.`,
          '- Do not read every candidate. Read only files whose path and line matches directly support the task.'
        ]
      : [
          '',
          'next_step:',
          '- Read only the relevant line ranges from candidate files.',
          '- If multiple files are clearly relevant, call multi_tool_use_parallel with builtin.readFile entries in one batch.'
        ]

  return [
    'search_summary:',
    `- output_lines: ${stdout ? stdout.split(/\r?\n/).filter(Boolean).length : 0}`,
    `- candidate_files: ${files.length}`,
    'candidate_files:',
    ...candidateLines,
    ...(files.length > SEARCH_CANDIDATE_FILE_LIMIT
      ? [`... (${files.length - SEARCH_CANDIDATE_FILE_LIMIT} more files omitted from summary)`]
      : []),
    ...refineHint
  ].join('\n')
}

const formatSearchOutput = (params: {
  cmd: string
  resolvedCmd: string
  cwd: string
  stdout: string
  stderr: string
  commandHint: string
}): string => {
  const { cmd, resolvedCmd, cwd, stdout, stderr, commandHint } = params
  const outputSections = [
    `命令执行完成\ncmd: ${cmd}${resolvedCmd !== cmd ? `\nresolved_cmd: ${resolvedCmd}` : ''}\ncwd: ${cwd}`
  ]

  if (commandHint) {
    outputSections.push(commandHint.trimStart())
  }

  const summary = buildSearchSummary(stdout)
  if (summary) {
    outputSections.push(summary)
  }

  if (stdout) {
    outputSections.push(
      `stdout:\n${truncateLinesAndText(stdout, SEARCH_OUTPUT_PREVIEW_LINE_LIMIT, SEARCH_OUTPUT_PREVIEW_CHAR_LIMIT)}`
    )
  }
  if (stderr) {
    outputSections.push(`stderr:\n${truncateText(stderr, 10000)}`)
  }

  return outputSections.join('\n\n')
}

export const getCodexBuiltinTools = (options?: CodexBuiltinToolsOptions): Partial<Tools> => {
  const editFileMode: 'hashline' | 'replace' =
    options?.editFileMode === 'hashline' ? 'hashline' : 'replace'
  const isReplaceEditFileMode = editFileMode === 'replace'
  return {
  change_working_directory: {
    title: '切换工作路径',
    description:
      '临时切换当前对话后续工具调用使用的工作路径。路径切换仅作用于本次对话的运行时状态，不会修改智能体配置。',
    render: ChangeWorkingDirectoryRender,
    renderSummary: (args: unknown) => {
      const path = String((args as Record<string, any>)?.path || '')
      return path ? `🔀 → ${path}` : '🔀 切换工作路径'
    },
    inputSchema: z.object({
      path: z
        .string()
        .describe('要切换到的目录路径。支持绝对路径；相对路径会基于当前工作路径解析。')
    }),
    execute: async (args: unknown, options?: CodexToolExecuteOptions) => {
      const params = args as Record<string, any>
      const rawPath = String(params.path || '')

      try {
        const canvasStore = useCanvasStore()
        const previousPath = getCurrentWorkPath(options?.chatId) || ''
        const nextPath = resolveWorkspaceRootPath(rawPath, options?.chatId)
        canvasStore.setWorkspaceRoot(nextPath, options?.chatId)

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: [
                  '工作路径已切换',
                  `previous_cwd: ${previousPath ? previousPath.replaceAll('\\', '/') : '未设置'}`,
                  `cwd: ${nextPath.replaceAll('\\', '/')}`,
                  '后续本对话内置工具调用将使用新的工作路径。'
                ].join('\n')
              }
            ]
          }
        }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `切换工作路径失败：${(error as Error).message}` }]
          }
        }
      }
    }
  },
  readFile: {
    title: '读取文件',
    render: ReadFileRender,
    renderSummary: (args: unknown) => {
      const params = args as Record<string, any>
      const path = String(params?.path || '')
      const start = Number(params?.start_line)
      const end = Number(params?.end_line)
      const range =
        Number.isFinite(start) && start > 0 && Number.isFinite(end) && end > 0
          ? ` :${start}-${end}`
          : ''
      return path ? `📖 ${path}${range}` : '📖 读取文件'
    },
    description:
      isReplaceEditFileMode
        ? [
            '读取 workPath 内的文本文件。精确替换模式下返回真实文件文本片段，不包含行号、hashline 文件头或其它展示前缀。',
            '可直接从 readFile 输出复制 old_string；保留精确缩进和换行。',
            'old_string 默认必须在文件中唯一；如果目标文本重复，请扩大 old_string 上下文，只有确实要全部替换时才设置 replace_all=true。',
            '默认只读取 160 行；显式传 end_line 或 limit 时会自动附带前 1 行、后 3 行上下文。',
            '除非用户明确要求浏览文件开头，否则应先用 search_project 定位行号，再读取小范围。',
            '需要更大上下文时继续调用 readFile 调整范围。',
            '需要搜索文件名或内容时请改用 search_project；定位到文件后再用 readFile 读取锚点。'
          ].join('\n')
        : [
            '读取 workPath 内的文本文件，并以 hashline 格式返回。',
            'hashlines 会包含文件头 ¶path#TAG，TAG 是当前文件快照指纹，编辑时必须原样复制。',
            '正文每一行格式为 LINE:内容，例如 12:const value = 1。编辑操作使用行号 12。',
            '默认只读取 160 行；显式传 end_line 或 limit 时会自动附带前 1 行、后 3 行上下文。',
            '除非用户明确要求浏览文件开头，否则应先用 search_project 定位行号，再读取小范围。',
            '超长行会截断显示，但仍可用行号编辑；提交前请确认目标行内容。',
            '编辑文件前必须先读取目标区域，复制 ¶path#TAG 文件头到 edit_file 的 content。',
            '需要搜索文件名或内容时请改用 search_project；定位到文件后再用 readFile 读取锚点。'
          ].join('\n'),
    inputSchema: z.object({
      path: z.string().describe('要读取的文件路径。相对路径会基于当前 workPath 解析。'),
      start_line: z.number().int().min(1).optional().describe('起始行号，1-based，默认 1。'),
      end_line: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe('结束行号，1-based；传入后会自动附带少量上下文。'),
      limit: z
        .number()
        .int()
        .min(1)
        .max(2000)
        .optional()
        .describe('最多读取多少行，默认 160，最大 2000。'),
      max_columns: z
        .number()
        .int()
        .min(20)
        .max(2000)
        .optional()
        .describe('单行最大显示列数，默认 240；超出后截断显示。')
    }),
    execute: async (args: unknown, options?: CodexToolExecuteOptions) => {
      const params = args as Record<string, any>
      const rawPath = String(params.path || '').trim()
      if (!rawPath) {
        return { toolResult: { content: [{ type: 'text', text: '读取文件失败：path 不能为空' }] } }
      }

      try {
        const baseDir = getCurrentWorkPath(options?.chatId)
        if (!baseDir) {
          return {
            error: '未设置 workPath',
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: '读取文件失败：未设置 workPath，优先使用 `change_working_directory` 工具临时设置'
                }
              ]
            }
          }
        }

        const result = await window.api.hashline.read({
          baseDir,
          path: rawPath,
          start_line: typeof params.start_line === 'number' ? params.start_line : undefined,
          end_line: typeof params.end_line === 'number' ? params.end_line : undefined,
          limit: typeof params.limit === 'number' ? params.limit : undefined,
          max_columns: typeof params.max_columns === 'number' ? params.max_columns : undefined,
          format: isReplaceEditFileMode ? 'plain' : 'hashline'
        })

        if (!result?.ok || !result.text) {
          throw new Error(result?.error || 'hashline read failed')
        }

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: result.text
              }
            ]
          }
        }
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
    render: ListDirRender,
    renderSummary: (args: unknown) => {
      const path = String((args as Record<string, any>)?.path || '')
      return path ? `📁 ${path}` : '📁 列出目录'
    },
    description: '列出指定目录下的文件和子目录，支持递归深度限制',
    inputSchema: z.object({
      path: z.string().describe('要列出的目录路径，支持相对路径（基于 workPath）或绝对路径'),
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
    execute: async (args: unknown, options?: CodexToolExecuteOptions) => {
      const params = args as Record<string, any>
      const rawPath = params.path as string
      const maxDepth = params.max_depth ?? 1
      const maxLength = params.max_length ?? 5000

      if (!rawPath) {
        return { toolResult: { content: [{ type: 'text', text: '列出目录失败：path 不能为空' }] } }
      }

      try {
        const dirPath = resolvePath(rawPath, options?.chatId)
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

        const processDir = (
          currentPath: string,
          currentDepth: number,
          ignoreState: IgnoreState
        ) => {
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
            } catch {}
            try {
              bIsDir =
                (window.api.fs.lstatSync(window.api.path.join(currentPath, b)).mode & 0o170000) ===
                0o040000
            } catch {}
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
              processDir(
                fullPath,
                currentDepth + 1,
                createIgnoreState(dirPath, fullPath, ignoreState)
              )
            }
          }
        }

        processDir(dirPath, 0, rootIgnoreState)

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: `Directory listing for ${dirPath.replaceAll('\\', '/')}:\n${results.join('')}`
              }
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
    title: '项目搜索',
    render: SearchProjectRender,
    renderSummary: (args: unknown) => {
      const cmd = String((args as Record<string, any>)?.cmd || '')
      return cmd ? `🔍 ${cmd}` : '🔍 项目搜索'
    },
    description: [
      '项目搜索工具。在当前 workPath 内执行 rg 风格搜索命令；本工具内部会注入 bundled ripgrep，不依赖 shell PATH 中是否存在 rg。',
      '搜索文件名或内容时必须调用 search_project，不要改用 exec_command 执行 rg/grep/git grep。',
      '返回会包含 search_summary、candidate_files 和 next_step；候选太多时先收窄搜索，不要逐个读取所有文件。',
      '常用模式：',
      '- 搜内容：rg -n "keyword" .',
      '- 只列命中文件：rg -l "keyword" apps/desktop/src -g "*.ts"',
      '- 搜文件名：rg --files | rg "keyword"',
      '- 限定目录或类型：rg -n "keyword" apps/desktop/src -g "*.ts" -g "*.vue"',
      '- 带上下文：rg -n "keyword" -C 3',
      '- 搜隐藏文件、ignore 文件或 node_modules：rg -uuu -n "keyword"',
      '- 输出可能很大时：加具体目录、-g/--glob、--max-count 或更精确关键词。',
      '拿到明确候选文件和行号后，再用 readFile 读取小范围；多个明确候选文件应使用 multi_tool_use_parallel 批量读取。'
    ].join('\n'),
    inputSchema: z.object({
      cmd: z
        .string()
        .describe('要原样执行的 rg 搜索命令，例如 rg -n "keyword" . 或 rg --files | rg "keyword"')
    }),
    execute: async (args: unknown, options?: CodexToolExecuteOptions) => {
      const params = args as Record<string, any>
      const cmd = String(params.cmd || '')
      if (!cmd.trim()) {
        return {
          toolResult: { content: [{ type: 'text', text: 'search_project 失败：cmd 不能为空' }] }
        }
      }

      try {
        const rootDir = resolvePath('.', options?.chatId)

        const resolvedCmd = injectBundledRipgrepPath(cmd)
        const isRipgrepCommand = startsWithRipgrep(cmd)
        const commandHint = isRipgrepCommand
          ? ''
          : '\n提示：search_project 是项目搜索工具，搜索内容或文件名时请使用 rg 风格命令，例如 rg -n "keyword" . 或 rg --files | rg "keyword"。'
        const result = await execProjectSearchCommand(resolvedCmd, {
          cwd: rootDir,
          maxBuffer: 8 * 1024 * 1024
        })
        const stdout = result.stdout.trim()
        const stderr = result.stderr.trim()
        const errorMessage = result.errorMessage?.trim() || ''

        if (result.code === 1 && !stdout) {
          const noOutputSections = [
            `命令执行完成，无标准输出${isRipgrepCommand ? '（rg 未找到匹配项）' : ''}`,
            `cmd: ${cmd}${resolvedCmd !== cmd ? `\nresolved_cmd: ${resolvedCmd}` : ''}`,
            `cwd: ${rootDir.replaceAll('\\', '/')}`,
            commandHint.trim(),
            'next_step:',
            '- Try a broader or alternate symbol/name search before reading files.',
            '- If the target file is already known, read only the expected small line range.'
          ].filter(Boolean)

          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `${noOutputSections.join('\n')}${stderr ? `\n\nstderr:\n${truncateText(stderr, 10000)}` : ''}`
                }
              ]
            }
          }
        }

        if (result.code !== 0 && result.code !== 1) {
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `search_project 失败：${stderr || truncateText(stdout, 10000) || errorMessage || 'command execution failed'}`
                }
              ]
            }
          }
        }

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: formatSearchOutput({
                  cmd,
                  resolvedCmd,
                  cwd: rootDir,
                  stdout,
                  stderr,
                  commandHint
                })
              }
            ]
          }
        }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `search_project 失败：${(error as Error).message}` }]
          }
        }
      }
    }
  },
  exec_command: {
    title: '在终端中执行命令',
    renderSummary: (args: unknown) => {
      const command = String((args as Record<string, any>)?.command || '')
      return command ? `💻 ${command}` : '💻 执行命令'
    },
    description: [
      '在现有终端会话中执行测试、构建、包管理、git 等真正需要终端的命令。',
      '首次调用可不传 terminal_id 来创建新终端；一旦工具返回了终端ID，后续相关命令应优先复用同一个 terminal_id，避免每次创建新终端导致上下文丢失。'
    ].join('\n'),
    inputSchema: z.object({
      command: z.string().describe('要执行的命令'),
      terminal_id: z
        .string()
        .optional()
        .describe(
          '要复用的终端ID。留空时会创建新终端；如果之前的 exec_command 已返回终端ID，后续同一任务必须复用该 terminal_id，只有明确需要独立新会话时才留空。'
        )
    }),
    execute: async (args: any, options?: CodexToolExecuteOptions) => {
      const { command, terminal_id } = args
      const availableBuiltinTools = getAvailableBuiltinToolSet(options)
      const fileToolHint = getDedicatedFileToolHint(String(command || ''), {
        searchTool: isBuiltinToolAvailable(availableBuiltinTools, 'search_project')
          ? 'search_project'
          : undefined,
        readTool: isBuiltinToolAvailable(availableBuiltinTools, 'readFile') ? 'readFile' : undefined,
        listTool: isBuiltinToolAvailable(availableBuiltinTools, 'list_dir') ? 'list_dir' : undefined
      })
      if (fileToolHint) {
        return {
          toolResult: {
            content: [{ type: 'text', text: fileToolHint }]
          }
        }
      }

      const { createTab } = useTerminal()
      const currentAgent = getCurrentAgent(options?.chatId)
      const runInBackground = currentAgent?.execCommandRunInBackground ?? false
      const cwd = getCurrentWorkPath(options?.chatId) || undefined

      const { id: tabId, result } = await createTab({
        command,
        cwd,
        id: terminal_id,
        toolCallId: options?.toolCallId,
        showTerminal: !runInBackground
      })
      return {
        toolResult: {
          content: [
            {
              type: 'stdout',
              text: `终端ID: ${tabId}\n后续如果要在同一终端继续执行命令，请复用这个终端ID。\n${truncateText(String(result?.output || ''), TOOL_OUTPUT_CHAR_LIMIT)}`
            }
          ]
        }
      }
    }
  },
  edit_file: (() => {
    const isReplaceMode = isReplaceEditFileMode
    const description = isReplaceMode
      ? [
          '编辑 workPath 内的文件。',
          '修改已有文件前必须先用 readFile 读取目标区域；path 指向目标文件，old_string 是要替换的原文，new_string 是替换后的文本。',
          'old_string 必须复制 readFile 返回的真实文件内容；保留精确缩进和换行。',
          '默认要求 old_string 在文件中唯一；如果匹配多处，请扩大 old_string 上下文，只有明确要替换所有匹配时才设置 replace_all=true。',
          '工具会先精确匹配；如果只存在弯引号/直引号差异，会使用文件里的实际文本执行替换。',
          '新增、删除、移动文件请切换到哈希行模式，或使用其它专用工具流程。',
          '所有路径必须位于当前 workPath 内。'
        ].join('\n')
      : [
          '编辑 workPath 内的文件。用 type 区分文件操作：update/add/delete/move。',
          '',
          'type=update：使用 hashline 编辑已有文件，必须提供 content。',
          '¶path/to/file#TAG',
          'replace N..M:',
          '+new line',
          'delete N..M',
          'insert before N:',
          '+new line',
          'insert after N: / insert head: / insert tail:',
          '',
          'type=add：提供 path 和 content，新建文件；目标已存在会失败。',
          'type=delete：提供 path，删除文件。',
          'type=move：提供 path 和 new_path，移动/重命名文件；目标已存在会失败。',
          '',
          'update 前必须用 readFile 获取最新 ¶path#TAG 文件头和行号。payload 每行必须以 + 开头，+ 单独一行表示插入空行。',
          '成功后会返回 old_hash/new_hash；下一次编辑同文件可直接用 new_hash 构造新的 ¶path#TAG 文件头；如果提示 snapshot mismatch，再调用 readFile 重读。',
          '所有路径必须位于当前 workPath 内。'
        ].join('\n')

    const inputSchema = isReplaceMode
      ? z.object({
          path: z
            .string()
            .describe('要编辑的文件路径。相对路径基于当前 workPath。'),
          old_string: z
            .string()
            .describe('要被替换的原文。必须来自 readFile 返回的真实文件内容。'),
          new_string: z.string().describe('替换后的文本。'),
          replace_all: z
            .boolean()
            .optional()
            .default(false)
            .describe('是否替换文件内所有匹配项。默认 false，要求 old_string 唯一。')
        })
      : z.object({
          type: z
            .enum(['update', 'add', 'delete', 'move'])
            .optional()
            .default('update')
            .describe('文件操作类型。update 走 hashline；add/delete/move 是文件级操作。'),
          path: z
            .string()
            .optional()
            .describe('type=add/delete/move 时的源/目标文件路径。相对路径基于当前 workPath。'),
          new_path: z
            .string()
            .optional()
            .describe('type=move 时的新文件路径。相对路径基于当前 workPath。'),
          content: z
            .string()
            .optional()
            .describe('type=update 时的 hashline 编辑内容；type=add 时的新文件内容。')
        })

    const execute = async (args: unknown, options?: CodexToolExecuteOptions) => {
      const params = args as Record<string, any>
      const content = typeof params.content === 'string' ? params.content : ''

      if (!isReplaceMode && !content.trim()) {
        return {
          error: '缺少必要参数: content',
          toolResult: {
            content: [
              {
                type: 'text',
                text: 'edit_file 失败：缺少必要参数 content'
              }
            ]
          }
        }
      }

      const baseDir = getCurrentWorkPath(options?.chatId)
      if (!baseDir) {
        return {
          error: '未设置 workPath',
          toolResult: {
            content: [
              {
                type: 'text',
                text: 'edit_file 失败：未设置 workPath，优先使用 `change_working_directory` 工具临时设置'
              }
            ]
          }
        }
      }

      if (isReplaceMode) {
        try {
          const result = await window.api.editFile.execute({
            baseDir,
            type: 'replace',
            path: nonEmptyString(params.path),
            old_string: typeof params.old_string === 'string' ? params.old_string : '',
            new_string: typeof params.new_string === 'string' ? params.new_string : '',
            replace_all: params.replace_all === true
          })

          if (!result?.ok || !result.summary) {
            throw new Error(result?.error || 'edit_file replace failed')
          }

          return {
            summary: result.summary,
            toolResult: {
              content: [{ type: 'text', text: result.summary }]
            }
          }
        } catch (error) {
          return {
            error: (error as Error).message,
            toolResult: {
              content: [{ type: 'text', text: `edit_file 失败: ${(error as Error).message}` }]
            }
          }
        }
      }

      try {
        const type = ['update', 'add', 'delete', 'move'].includes(params.type)
          ? params.type
          : 'update'
        const input = type === 'update' ? content : ''
        const result = await window.api.editFile.execute({
          baseDir,
          type,
          input,
          path: nonEmptyString(params.path),
          new_path: type === 'move' ? nonEmptyString(params.new_path) : undefined,
          content: type === 'add' ? content : undefined
        })

        if (!result?.ok || !result.summary) {
          throw new Error(result?.error || 'edit_file failed')
        }

        return {
          summary: result.summary,
          toolResult: {
            content: [{ type: 'text', text: result.summary }]
          }
        }
      } catch (error) {
        return {
          error: (error as Error).message,
          toolResult: {
            content: [{ type: 'text', text: `edit_file 失败: ${(error as Error).message}` }]
          }
        }
      }
    }

    return {
      title: '编辑文件',
      render: EditFileRender,
      renderSummary: (args: unknown) => {
        const params = (args as Record<string, any>) || {}
        if (isReplaceMode) {
          const path = String(params.path || '')
          return path ? `✏ 替换 ${path}` : '✏ 替换文本'
        }
        const type = String(params.type || 'update')
        const path = String(params.path || '')
        const newPath = String(params.new_path || '')
        switch (type) {
          case 'add':
            return path ? `➕ 新增 ${path}` : '➕ 新增文件'
          case 'delete':
            return path ? `🗑 删除 ${path}` : '🗑 删除文件'
          case 'move':
            return path && newPath ? `↪ 移动 ${path} → ${newPath}` : '↪ 移动文件'
          default:
            return path ? `✏ 更新 ${path}` : '✏ 更新文件'
        }
      },
      description,
      inputSchema,
      execute
    }
  })()
}
}
