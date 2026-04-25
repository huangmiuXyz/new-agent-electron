import { z } from 'zod'
import {
  normalizeSandboxPath,
  readSandboxWorkspaceAsync
} from '@renderer/services/sandbox'
import { execRipgrepSearch, injectBundledRipgrepPath } from './command-utils'

const isWindows = navigator.platform.toLowerCase().includes('win')

const getPowerShellPath = (): string => {
  const systemRoot = window.api.process.env.SystemRoot
  return systemRoot
    ? window.api.path.join(systemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    : 'powershell.exe'
}

const getPosixShellPath = (): string => window.api.process.env.SHELL || '/bin/sh'

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

const ensureCanvasWorkspace = async (chatId?: string) => {
  const canvasStore = useCanvasStore()
  const workspaceDir = canvasStore.getWorkspaceDir(chatId)
  await window.api.fs.promises.mkdir(workspaceDir, { recursive: true })
  return {
    sandbox: await readSandboxWorkspaceAsync(workspaceDir),
    workspaceDir
  }
}

const summarizeCanvasSync = (
  previousFiles: Record<string, { content: string }>,
  nextFiles: Record<string, { content: string }>
) => {
  let added = 0
  let updated = 0
  let deleted = 0

  for (const [path, nextFile] of Object.entries(nextFiles)) {
    const previousFile = previousFiles[path]
    if (!previousFile) {
      added += 1
      continue
    }

    if (previousFile.content !== nextFile.content) {
      updated += 1
    }
  }

  for (const path of Object.keys(previousFiles)) {
    if (!nextFiles[path]) {
      deleted += 1
    }
  }

  return `Canvas 已同步：新增 ${added} 个文件，更新 ${updated} 个文件，删除 ${deleted} 个文件。`
}

const openCanvasPanel = () => {
  const settingsStore = useSettingsStore()
  settingsStore.display.speechSidebarCollapsed = false
  settingsStore.display.assistantSidebarTab = 'canvas'
}

const normalizeDirectoryPath = (value?: string) => {
  if (!value || value === '/') return '/'
  return normalizeSandboxPath(value)
}

const formatDirectoryList = (chatId?: string, directoryPath = '/') => {
  const canvasStore = useCanvasStore()
  const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath)

  // 使用 listDirectory 而不是 getCanvas，避免读取整个工作区到内存
  const entries = canvasStore.listDirectory(normalizedDirectoryPath, chatId)

  if (entries.length === 0) {
    return `目录 ${normalizedDirectoryPath} 为空。`
  }

  const lines = entries.map((entry) => {
    if (entry.type === 'directory') {
      return `[DIR] ${entry.path}`
    }
    return `[FILE] ${entry.path}`
  })

  return [`目录: ${normalizedDirectoryPath}`, ...lines].join('\n')
}

const quotePosixPath = (value: string) => `'${value.replaceAll('\'', '\'\\\'\'')}'`

const quotePowerShellPath = (value: string) => `'${value.replaceAll('\'', '\'\'')}'`

const buildLegacyReadCommand = (
  filePath: string,
  options?: { startLine?: number; endLine?: number }
) => {
  const normalizedFilePath = normalizeSandboxPath(filePath)
  const hasLineRange = options?.startLine !== undefined || options?.endLine !== undefined
  const startLine = Math.max(1, options?.startLine || 1)

  if (isWindows) {
    const quotedPath = quotePowerShellPath(`.${normalizedFilePath}`)
    if (!hasLineRange) {
      return `Get-Content -Path ${quotedPath}`
    }

    const endLine = Math.max(startLine, options?.endLine || startLine)
    const lineCount = endLine - startLine + 1
    return `(Get-Content -Path ${quotedPath}) | Select-Object -Skip ${startLine - 1} -First ${lineCount}`
  }

  const quotedPath = quotePosixPath(`.${normalizedFilePath}`)
  if (!hasLineRange) {
    return `cat ${quotedPath}`
  }

  const endLine = Math.max(startLine, options?.endLine || startLine)
  return `sed -n '${startLine},${endLine}p' ${quotedPath}`
}

const searchCanvasContent = (
  workspaceDir: string,
  query: string,
  options?: { caseSensitive?: boolean; maxResults?: number }
): Promise<string> => {
  const keyword = String(query || '')
  if (!keyword.trim()) {
    throw new Error('缺少必要参数: query')
  }

  const caseSensitive = Boolean(options?.caseSensitive)
  const maxResults = Math.max(1, Math.min(options?.maxResults || 20, 100))
  return execRipgrepSearch(keyword, {
    cwd: workspaceDir,
    caseSensitive,
    maxBuffer: 8 * 1024 * 1024
  }).then(({ result, resolvedCmd }) => {
    const stdout = result.stdout.trim()
    const stderr = result.stderr.trim()
    const errorMessage = result.errorMessage?.trim() || ''

    if (result.code === 1 && !stdout) {
      return `命令执行完成，无标准输出\ncmd: rg ${keyword}\nresolved_cmd: ${resolvedCmd}\ncwd: ${workspaceDir.replaceAll('\\', '/')}${stderr ? `\n\nstderr:\n${stderr}` : ''}`
    }

    if (result.code !== 0 && result.code !== 1) {
      throw new Error(stderr || stdout.substring(0, 10000) || errorMessage || 'command execution failed')
    }

    const lines = stdout ? stdout.split('\n') : []
    const limitedLines = lines.slice(0, maxResults)
    const outputSections = [
      `命令执行完成\ncmd: rg ${keyword}\nresolved_cmd: ${resolvedCmd}\ncwd: ${workspaceDir.replaceAll('\\', '/')}`
    ]

    if (limitedLines.length > 0) {
      outputSections.push(`stdout:\n${limitedLines.join('\n')}`)
    }
    if (lines.length > maxResults) {
      outputSections.push(`已达到结果上限 ${maxResults} 条。`)
    }
    if (stderr) {
      outputSections.push(`stderr:\n${stderr}`)
    }

    return outputSections.join('\n\n')
  })
}

export const getCanvasBuiltinTools = (): Partial<Tools> => ({
  list_canvas_directory: {
    title: '列出 Canvas 目录',
    description: '列出当前 Canvas 工作区中某个目录下的直接子目录和文件。需要搜索文件名、代码或内容时，优先改用 exec_command_canvas 并使用 rg。',
    inputSchema: z.object({
      directory_path: z.string().optional().describe('要列出的目录路径，默认为 /')
    }),
    execute: async (args: unknown, options?: { chatId?: string }) => {
      const params = args as { directory_path?: string }

      try {
        openCanvasPanel()

        return {
          toolResult: {
            content: [{ type: 'text', text: formatDirectoryList(options?.chatId, params.directory_path || '/') }]
          }
        }
      } catch (error) {
        return {
          error: (error as Error).message,
          toolResult: {
            content: [{ type: 'text', text: `list_canvas_directory 失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  read_canvas_file: {
    title: '读取 Canvas 文件',
    description: isWindows
      ? '用于读取当前 Canvas 工作区中的文件内容。优先使用 Get-Content、type、findstr 等读取命令；需要搜索内容时请改用 search_canvas_content 或 exec_command_canvas，并优先使用 rg。'
      : '用于读取当前 Canvas 工作区中的文件内容。优先使用 cat、sed、nl 等读取命令；需要搜索内容时请改用 search_canvas_content 或 exec_command_canvas，并优先使用 rg。',
    inputSchema: z.object({
      cmd: z.string().optional().describe('要原样执行的命令字符串'),
      file_path: z.string().optional().describe('兼容旧参数：要读取的文件路径'),
      start_line: z.number().int().min(1).optional().describe('兼容旧参数：起始行号，1-based，可选'),
      end_line: z.number().int().min(1).optional().describe('兼容旧参数：结束行号，1-based，可选')
    }),
    execute: async (args: unknown, options?: { chatId?: string }) => {
      const params = args as { cmd?: string; file_path?: string; start_line?: number; end_line?: number }
      const cmd = String(params.cmd || '').trim()
      const filePath = String(params.file_path || '').trim()
      const resolvedCmd = cmd || (filePath
        ? buildLegacyReadCommand(filePath, {
          startLine: params.start_line,
          endLine: params.end_line
        })
        : '')

      if (!resolvedCmd) {
        return {
          error: '缺少必要参数: cmd',
          toolResult: {
            content: [{ type: 'text', text: 'read_canvas_file 失败：缺少必要参数 cmd' }]
          }
        }
      }

      try {
        openCanvasPanel()
        const { workspaceDir } = await ensureCanvasWorkspace(options?.chatId)
        const result = await execCommand(resolvedCmd, { cwd: workspaceDir, maxBuffer: 8 * 1024 * 1024 })
        const stdout = result.stdout.trim()
        const stderr = result.stderr.trim()
        const errorMessage = result.errorMessage?.trim() || ''

        if (result.code === 1 && !stdout) {
          return {
            toolResult: {
              content: [{
                type: 'text',
                text: `命令执行完成，无标准输出\ncmd: ${resolvedCmd}\ncwd: ${workspaceDir.replaceAll('\\', '/')}\n${stderr ? `\nstderr:\n${stderr}` : ''}`
              }]
            }
          }
        }

        if (result.code !== 0 && result.code !== 1) {
          return {
            error: stderr || stdout || errorMessage || 'command execution failed',
            toolResult: {
              content: [{
                type: 'text',
                text: `read_canvas_file 失败：${stderr || stdout || errorMessage || 'command execution failed'}`
              }]
            }
          }
        }

        const outputSections = [`命令执行完成\ncmd: ${resolvedCmd}\ncwd: ${workspaceDir.replaceAll('\\', '/')}`]
        if (stdout) {
          outputSections.push(`stdout:\n${stdout}`)
        }
        if (stderr) {
          outputSections.push(`stderr:\n${stderr}`)
        }

        return {
          toolResult: {
            content: [{
              type: 'text',
              text: outputSections.join('\n\n')
            }]
          }
        }
      } catch (error) {
        return {
          error: (error as Error).message,
          toolResult: {
            content: [{ type: 'text', text: `read_canvas_file 失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  search_canvas_content: {
    title: '搜索 Canvas 内容',
    description: '使用 rg 在当前 Canvas 工作区中搜索指定代码或内容，返回匹配文件、行号和文本。',
    inputSchema: z.object({
      query: z.string().describe('要搜索的关键词或文本片段'),
      case_sensitive: z.boolean().optional().default(false).describe('是否区分大小写，默认 false'),
      max_results: z.number().int().min(1).max(100).optional().default(20).describe('最多返回多少条结果，默认 20')
    }),
    execute: async (args: unknown, options?: { chatId?: string }) => {
      const params = args as {
        query?: string
        case_sensitive?: boolean
        max_results?: number
      }

      try {
        openCanvasPanel()
        const { workspaceDir } = await ensureCanvasWorkspace(options?.chatId)

        return {
          toolResult: {
            content: [{
              type: 'text',
              text: await searchCanvasContent(workspaceDir, String(params.query || ''), {
                caseSensitive: params.case_sensitive,
                maxResults: params.max_results
              })
            }]
          }
        }
      } catch (error) {
        return {
          error: (error as Error).message,
          toolResult: {
            content: [{ type: 'text', text: `search_canvas_content 失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  exec_command_canvas: {
    title: '在 Canvas 工作区执行命令',
    description:
      '在现有 Canvas 终端会话中执行命令。首次调用可不传 terminal_id 来创建新终端；一旦工具返回了终端ID，后续相关命令应优先复用同一个 terminal_id。搜索代码、内容或文件时优先使用 rg；读取代码或文件时优先使用 cat、sed、nl 等命令。',
    inputSchema: z.object({
      command: z.string().describe('要执行的命令'),
      terminal_id: z
        .string()
        .optional()
        .describe('要复用的终端ID。留空时会创建新终端；如果之前已返回 terminal_id，后续同一任务应复用该 ID。')
    }),
    execute: async (
      args: unknown,
      options?: { toolCallId?: string; chatId?: string; model?: string; provider?: string }
    ) => {
      // 先把工具入参收窄成当前工具实际关心的字段。
      const params = args as {
        command?: string
        terminal_id?: string
      }
      // 统一转成字符串并去掉首尾空白，避免把空命令传进终端。
      const command = String(params.command || '').trim()

      // 没有命令时直接返回结构化错误，避免后面继续做文件同步和终端创建。
      if (!command) {
        return {
          error: '缺少必要参数: command',
          toolResult: {
            content: [{ type: 'text', text: 'exec_command_canvas 失败：缺少必要参数 command' }]
          }
        }
      }

      try {
        // 执行前先把右侧画布面板展开，方便用户看到后续同步和终端结果。
        openCanvasPanel()

        // 取到当前聊天对应的 canvas store，后面需要把工作区改动同步回画布。
        const canvasStore = useCanvasStore()
        // 拿到当前聊天实际使用的工作区快照；它可能是默认临时目录，也可能是用户切换后的本地目录。
        const { sandbox, workspaceDir } = await ensureCanvasWorkspace(options?.chatId)
        // 像 codex 工具一样，对直接以 rg 开头的命令注入内置 ripgrep 路径，避免环境差异。
        const resolvedCommand = injectBundledRipgrepPath(command)
        // 复用全局终端能力，在已有终端标签或新终端标签里执行命令。
        const { createTab } = useTerminal()
        // 以当前画布工作区作为 cwd 执行命令，这样命令里可以直接用相对路径。
        const { id: tabId, result } = await createTab({
          command: resolvedCommand,
          cwd: workspaceDir,
          promptLabel: 'canvas',
          id: params.terminal_id,
          toolCallId: options?.toolCallId,
          showTerminal: true
        })
        // 命令执行结束后，把当前工作区里的最新文件重新读回成 canvas 状态。
        const syncedCanvas = await readSandboxWorkspaceAsync(workspaceDir)
        // 尽量保留用户之前选中的文件；如果那个文件已经不存在了，再退回到新的 activeFilePath。
        const nextActiveFilePath = sandbox.activeFilePath && syncedCanvas.files[sandbox.activeFilePath]
          ? sandbox.activeFilePath
          : syncedCanvas.activeFilePath
        // 用工作区执行后的最新结果覆盖当前聊天里的 canvas。
        if (nextActiveFilePath) {
          canvasStore.setActiveFilePath(nextActiveFilePath, options?.chatId)
        } else {
          canvasStore.resetActiveFilePath(options?.chatId)
        }
        canvasStore.touchWorkspace(options?.chatId)
        // 生成一段新增/更新/删除统计，方便工具调用结果里快速理解发生了什么。
        const syncSummary = summarizeCanvasSync(sandbox.files, syncedCanvas.files)

        // 返回给模型和界面的结果里包含终端ID、工作区路径、同步摘要和命令输出。
        return {
          toolResult: {
            content: [{
              type: 'stdout',
              text:
                `终端ID: ${tabId}\n` +
                `cmd: ${command}\n` +
                `${resolvedCommand !== command ? `resolved_cmd: ${resolvedCommand}\n` : ''}` +
                `Canvas 工作区: ${workspaceDir.replaceAll('\\', '/')}\n` +
                `${syncSummary}\n` +
                '后续如果要在同一终端继续执行命令，请复用这个终端ID。\n' +
                `${result?.output || ''}`
            }]
          }
        }
      } catch (error) {
        // 兜底把运行期错误转成工具协议可消费的失败结果。
        return {
          error: (error as Error).message,
          toolResult: {
            content: [{ type: 'text', text: `exec_command_canvas 失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  search_replace_canvas: {
    title: '搜索和替换 Canvas',
    description:
      '在当前 Canvas 工作区中执行文件操作：modify(替换内容)、add(新增文件)、delete(删除文件)、move(移动/重命名文件)。',
    inputSchema: z.object({
      type: z
        .enum(['modify', 'add', 'delete', 'move'])
        .optional()
        .default('modify')
        .describe('操作类型：modify=替换文件内容，add=新增文件，delete=删除文件，move=移动/重命名文件'),
      file_path: z.string().describe('源文件路径（add/delete/modify 为目标文件，move 为原路径）'),
      old_str: z.string().optional().describe('type=modify 时必填：要搜索的旧代码片段'),
      new_str: z.string().optional().describe('type=modify 时为替换内容；type=add 时为新文件内容'),
      target_path: z.string().optional().describe('type=move 时必填：目标文件路径'),
      overwrite: z
        .boolean()
        .optional()
        .default(false)
        .describe('type=add 或 move 时可选：目标已存在时是否覆盖，默认 false')
    }),
    execute: async (args: unknown, options?: { chatId?: string }) => {
      const params = args as {
        type?: 'modify' | 'add' | 'delete' | 'move'
        file_path?: string
        old_str?: string
        new_str?: string
        target_path?: string
        overwrite?: boolean
      }
      const filePath = typeof params.file_path === 'string' ? params.file_path : ''

      if (!filePath.trim()) {
        return {
          error: '缺少必要参数: file_path',
          toolResult: {
            content: [{ type: 'text', text: 'search_replace_canvas 失败：缺少必要参数 file_path' }]
          }
        }
      }

      try {
        const canvasStore = useCanvasStore()
        const result = canvasStore.applyOperation(
          {
            type: params.type,
            filePath,
            oldStr: params.old_str,
            newStr: params.new_str,
            targetPath: params.target_path,
            overwrite: params.overwrite
          },
          options?.chatId
        )

        openCanvasPanel()

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
            content: [{ type: 'text', text: `search_replace_canvas 失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  }
})
