import { z } from 'zod'
import ignore from 'ignore'
import { injectBundledRipgrepPath } from './command-utils'

type CodexToolExecuteOptions = {
  chatId?: string
  toolCallId?: string
}

const getCurrentAgent = (chatId?: string) => {
  const chatsStore = useChatsStores()
  const agentStore = useAgentStore()
  const agentId = chatsStore.getChatById(chatId || '')?.agentId || chatsStore.currentChat?.agentId || 'default'
  return agentStore.getAgentById(agentId) || null
}

const getCurrentWorkPath = (chatId?: string) => {
  return useCanvasStore().getWorkPath(chatId)
}

const resolveWorkspaceRootPath = (rawPath: string, chatId?: string): string => {
  const inputPath = rawPath.trim()
  if (!inputPath) {
    throw new Error('path 不能为空')
  }

  const currentWorkPath = getCurrentWorkPath(chatId)
  const resolvedPath =
    window.api.path.isAbsolute(inputPath)
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
    throw new Error('未设置 workPath，已禁止回退路径解析，优先使用 `set_work_path` 工具临时设置，禁止使用exec_command执行')
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
    throw new Error(`路径越界：仅允许访问 workPath 内文件 (${normalizedBaseDir})`)
  }

  return resolvedPath
}

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

const execCommand = async (
  command: string,
  options: { cwd?: string; maxBuffer?: number } = {}
): Promise<{ code: number | null; stdout: string; stderr: string; errorMessage?: string; errorCode?: string }> => {
  const resolvedCommand = injectBundledRipgrepPath(command)
  if (isWindows) {
    return window.api.execFileCommand(
      getPowerShellPath(),
      ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', resolvedCommand],
      options
    )
  }

  return window.api.execFileCommand(getPosixShellPath(), ['-lc', resolvedCommand], options)
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
): Promise<{ code: number | null; stdout: string; stderr: string; errorMessage?: string; errorCode?: string }> => {
  if (!isWindows) {
    return window.api.execFileCommand(getPosixShellPath(), ['-lc', command], options)
  }

  return window.api.execFileCommand(
    getPowerShellPath(),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
    options
  )
}

const isWindows = navigator.platform.toLowerCase().includes('win')
const startsWithRipgrep = (command: string): boolean => /^rg(?:\s|$)/.test(command.trimStart())

export const getCodexBuiltinTools = (): Partial<Tools> => ({
  change_working_directory: {
    title: '切换工作路径',
    description:
      '临时切换当前对话后续工具调用使用的工作路径。路径切换仅作用于本次对话的运行时状态，不会修改智能体配置。',
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
    description: isWindows
      ? '用于读取文件内容。优先使用 Get-Content、type、findstr 等读取命令；需要搜索内容时请改用 search_project 并优先使用 rg。'
      : '用于读取文件内容。优先使用 cat、sed、nl 等读取命令；需要搜索内容时请改用 search_project 并优先使用 rg。',
    inputSchema: z.object({
      cmd: z.string().describe('要原样执行的命令字符串')
    }),
    execute: async (args: unknown, options?: CodexToolExecuteOptions) => {
      const params = args as Record<string, any>
      const cmd = String(params.cmd || '')
      if (!cmd.trim()) {
        return { toolResult: { content: [{ type: 'text', text: '读取文件失败：cmd 不能为空' }] } }
      }

      try {
        const rootDir = resolvePath('.', options?.chatId)
        const result = await execCommand(cmd, { cwd: rootDir, maxBuffer: 8 * 1024 * 1024 })
        const stdout = result.stdout.trim()
        const stderr = result.stderr.trim()
        const errorMessage = result.errorMessage?.trim() || ''

        if (result.code === 1 && !stdout) {
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `命令执行完成，无标准输出\ncmd: ${cmd}\ncwd: ${rootDir.replaceAll('\\', '/')}\n${stderr ? `\nstderr:\n${stderr}` : ''}`
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
                  text: `读取文件失败：${stderr || stdout || errorMessage || 'command execution failed'}`
                }
              ]
            }
          }
        }

        const outputSections = [`命令执行完成\ncmd: ${cmd}\ncwd: ${rootDir.replaceAll('\\', '/')}`]
        if (stdout) {
          outputSections.push(`stdout:\n${stdout}`)
        }
        if (stderr) {
          outputSections.push(`stderr:\n${stderr}`)
        }

        return {
          toolResult: {
            content: [{ type: 'text', text: outputSections.join('\n\n') }]
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
              { type: 'text', text: `Directory listing for ${dirPath.replaceAll('\\', '/')}:\n${results.join('')}` }
            ]
          }
        }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `鍒楀嚭鐩綍澶辫触: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  search_project: {
    title: '项目搜索',
    description:
      [
        '使用 ripgrep(rg) 在当前 workPath 内搜索项目文件。必须使用 rg。',
        '常用模式：',
        '- 搜内容：rg -n "keyword" .',
        '- 搜文件名：rg --files | rg "keyword"',
        '- 限定目录或类型：rg -n "keyword" apps/desktop/src -g "*.ts" -g "*.vue"',
        '- 带上下文：rg -n "keyword" -C 3',
        '- 搜隐藏文件、ignore 文件或 node_modules：rg -uuu -n "keyword"',
        '- 输出可能很大时：加具体目录、-g/--glob、--max-count 或更精确关键词。',
      ].join('\n'),
    inputSchema: z.object({
      cmd: z.string().describe('要原样执行的 rg 搜索命令，例如 rg -n "keyword" . 或 rg --files | rg "keyword"')
    }),
    execute: async (args: unknown, options?: CodexToolExecuteOptions) => {
      const params = args as Record<string, any>
      const cmd = String(params.cmd || '')
      if (!cmd.trim()) {
        return { toolResult: { content: [{ type: 'text', text: 'search_project 失败：cmd 不能为空' }] } }
      }

      try {
        const rootDir = resolvePath('.', options?.chatId)

        const resolvedCmd = injectBundledRipgrepPath(cmd)
        const isRipgrepCommand = startsWithRipgrep(cmd)
        const commandHint = isRipgrepCommand
          ? ''
          : '\n提示：search_project 是项目搜索工具，搜索内容或文件名时请优先使用 rg，例如 rg -n "keyword" . 或 rg --files | rg "keyword"。'
        const result = await execProjectSearchCommand(resolvedCmd, { cwd: rootDir, maxBuffer: 8 * 1024 * 1024 })
        const stdout = result.stdout.trim()
        const stderr = result.stderr.trim()
        const errorMessage = result.errorMessage?.trim() || ''

        if (result.code === 1 && !stdout) {
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `命令执行完成，无标准输出${isRipgrepCommand ? '（rg 未找到匹配项）' : ''}\ncmd: ${cmd}${resolvedCmd !== cmd ? `\nresolved_cmd: ${resolvedCmd}` : ''}\ncwd: ${rootDir.replaceAll('\\', '/')}${commandHint}\n${stderr ? `\nstderr:\n${stderr}` : ''}`
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
                  text: `search_project 失败：${stderr || stdout.substring(0, 10000) || errorMessage || 'command execution failed'}`
                }
              ]
            }
          }
        }

        const outputSections = [
          `命令执行完成\ncmd: ${cmd}${resolvedCmd !== cmd ? `\nresolved_cmd: ${resolvedCmd}` : ''}\ncwd: ${rootDir}`
        ]
        if (commandHint) {
          outputSections.push(commandHint.trimStart())
        }
        if (stdout) {
          outputSections.push(`stdout:\n${stdout}`)
        }
        if (stderr) {
          outputSections.push(`stderr:\n${stderr}`)
        }

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: outputSections.join('\n\n')
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
    description:
      '在现有终端会话中执行命令。首次调用可不传 terminal_id 来创建新终端；一旦工具返回了终端ID，后续相关命令应优先复用同一个 terminal_id，避免每次创建新终端导致上下文丢失。',
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
          content: [{
            type: 'stdout',
            text: `终端ID: ${tabId}\n后续如果要在同一终端继续执行命令，请复用这个终端ID。\n${result!.output}`
          }]
        }
      }
    }
  },
  edit_file: {
    title: '编辑文件',
    description: [
      '使用 edit_file 编辑 workPath 内的文件。',
      '',
      '支持四种操作：',
      'type=add：创建文件，path 为文件路径，new_string 为完整文件内容。',
      'type=modify：替换文件中的一段文本，path 为文件路径，old_string 为要替换的原文，new_string 为替换后的文本。',
      'type=delete：删除文件，path 为文件路径。',
      'type=move：移动/重命名文件，path 为源路径，new_string 为目标路径。',
      '',
      '所有路径必须位于当前 workPath 内。add/move 默认不会覆盖已有文件，除非传 overwrite=true。',
      'modify 要求 old_string 精确匹配；为避免误改，old_string 应尽量包含足够上下文且只匹配一次。'
    ].join('\n'),
    inputSchema: z.object({
      path: z
        .string()
        .describe('要操作的文件路径。相对路径会基于当前 workPath 解析。type=move 时表示源路径。'),
      type: z
        .enum(['add', 'modify', 'delete', 'move'])
        .describe('操作类型：add 新增文件，modify 替换文本，delete 删除文件，move 移动/重命名文件。'),
      old_string: z
        .string()
        .optional()
        .describe('type=modify 时必填，要替换的原文。'),
      new_string: z
        .string()
        .optional()
        .describe('type=add 时为完整文件内容；type=modify 时为替换后的文本；type=move 时为目标路径。'),
      overwrite: z
        .boolean()
        .optional()
        .describe('type=add 或 type=move 目标已存在时是否覆盖，默认 false。')
    }),
    execute: async (args: unknown, options?: CodexToolExecuteOptions) => {
      const params = args as Record<string, any>
      const filePath = typeof params.path === 'string' ? params.path.trim() : ''
      const type = typeof params.type === 'string' ? params.type.trim().toLowerCase() : ''

      if (!filePath) {
        return {
          error: '缺少必要参数: path',
          toolResult: {
            content: [{ type: 'text', text: 'edit_file 失败：缺少必要参数 path' }]
          }
        }
      }

      if (!['add', 'modify', 'delete', 'move'].includes(type)) {
        return {
          error: '缺少或不支持的参数: type',
          toolResult: {
            content: [{ type: 'text', text: 'edit_file 失败：type 必须是 add、modify、delete 或 move' }]
          }
        }
      }

      const baseDir = getCurrentWorkPath(options?.chatId)
      if (!baseDir) {
        return {
          error: '未设置 workPath',
          toolResult: {
            content: [{ type: 'text', text: 'edit_file 失败：未设置 workPath，优先使用 `set_work_path` 工具临时设置' }]
          }
        }
      }
      try {
        const result = await window.api.editFile.execute({
          baseDir,
          path: filePath,
          type: type as 'add' | 'modify' | 'delete' | 'move',
          old_string: typeof params.old_string === 'string' ? params.old_string : undefined,
          new_string: typeof params.new_string === 'string' ? params.new_string : undefined,
          overwrite: Boolean(params.overwrite)
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
  }
})
