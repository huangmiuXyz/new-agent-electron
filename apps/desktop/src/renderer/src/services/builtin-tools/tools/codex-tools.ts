import { z } from 'zod'
import ignore from 'ignore'
import ApplyPatchRender from '../components/ApplyPatchRender.vue'

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

const execCommand = (
  command: string,
  options: { cwd?: string; maxBuffer?: number } = {}
): Promise<{ code: number | null; stdout: string; stderr: string; errorMessage?: string; errorCode?: string }> => {
  return new Promise((resolve) => {
    window.api.exec(command, options, (error, stdout, stderr) => {
      if (error) {
        const errorWithCode = error as NodeJS.ErrnoException & { code?: number | string }
        resolve({
          code: typeof errorWithCode.code === 'number' ? errorWithCode.code : null,
          stdout,
          stderr,
          errorMessage: errorWithCode.message,
          errorCode: typeof errorWithCode.code === 'string' ? errorWithCode.code : undefined
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

export const getCodexBuiltinTools = (): Partial<Tools> => ({
  readFile: {
    title: '读取文件',
    description: '直接执行传入的命令字符串，不对命令内容做任何修改。',
    inputSchema: z.object({
      cmd: z.string().describe('要原样执行的命令字符串')
    }),
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const cmd = String(params.cmd || '')
      if (!cmd.trim()) {
        return { toolResult: { content: [{ type: 'text', text: '读取文件失败：cmd 不能为空' }] } }
      }

      try {
        const rootDir = resolvePath('.')
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
      '请使用rg进行搜索，直接执行传入的命令字符串，不对命令内容做任何修改。',
    inputSchema: z.object({
      cmd: z.string().describe('要原样执行的命令字符串')
    }),
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const cmd = String(params.cmd || '')
      if (!cmd.trim()) {
        return { toolResult: { content: [{ type: 'text', text: 'search_project 失败：cmd 不能为空' }] } }
      }

      try {
        const rootDir = resolvePath('.')
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
                  text: `search_project 失败：${stderr || stdout || errorMessage || 'command execution failed'}`
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
    execute: async (args: any, options: any) => {
      const { command, terminal_id } = args
      const { createTab } = useTerminal()
      const currentAgent = getCurrentAgent()
      const runInBackground = currentAgent?.execCommandRunInBackground ?? false

      const { id: tabId, result } = await createTab({
        command,
        id: terminal_id,
        toolCallId: options.toolCallId,
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
        const result = await window.api.searchReplace.execute({
          baseDir,
          type,
          filePath,
          oldStr,
          newStr,
          targetPath,
          overwrite
        })

        if (!result?.ok || !result.summary) {
          throw new Error(result?.error || 'search_replace failed')
        }

        return {
          summaries: [result.summary],
          toolResult: {
            content: [{ type: 'text', text: result.summary }]
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
