import { z } from 'zod'
import {
  createSandboxState,
  getSandboxTempWorkspacePath,
  normalizeSandboxPath,
  readSandboxWorkspaceAsync,
  type SandboxState
} from '@renderer/services/sandbox'
import { execRipgrepSearch, injectBundledRipgrepPath } from './command-utils'

const ensureCanvasWorkspace = async (chatId?: string) => {
  const canvasStore = useCanvasStore()
  const workspaceDir = canvasStore.getWorkspaceDir(chatId)
  await window.api.fs.promises.mkdir(workspaceDir, { recursive: true })
  return {
    workspaceDir
  }
}

const isTempCanvasWorkspace = (workspaceDir: string, chatId?: string) => {
  const resolvedChatId = chatId || useChatsStores().currentChat?.id || 'default'
  return workspaceDir === getSandboxTempWorkspacePath(resolvedChatId)
}

const readCanvasSnapshotForSync = async (
  workspaceDir: string,
  chatId?: string
): Promise<SandboxState | null> => {
  if (!isTempCanvasWorkspace(workspaceDir, chatId)) return null
  try {
    return await readSandboxWorkspaceAsync(workspaceDir)
  } catch {
    return createSandboxState()
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

const normalizeCanvasEditPath = (workspaceDir: string, rawPath: string) => {
  const inputPath = rawPath.trim()
  const noPrefixPath =
    inputPath.startsWith('a/') || inputPath.startsWith('b/') ? inputPath.slice(2) : inputPath
  const resolvedPath = window.api.path.isAbsolute(noPrefixPath)
    ? window.api.path.resolve(window.api.path.normalize(noPrefixPath))
    : window.api.path.resolve(workspaceDir, noPrefixPath)
  const relativePath = window.api.path.relative(workspaceDir, resolvedPath)
  const isInsideWorkspace =
    relativePath === '' || (!relativePath.startsWith('..') && !window.api.path.isAbsolute(relativePath))

  if (!isInsideWorkspace) {
    throw new Error(`路径越界：仅允许访问 Canvas 工作区内文件 (${workspaceDir})`)
  }

  return normalizeSandboxPath(relativePath)
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
    description:
      [
        '读取当前 Canvas 工作区中的文本文件，并以 hashline 格式返回。',
        '每一行格式为 LINEhash|内容，例如 12ab|const value = 1。',
        '锚点只包含 | 左侧的 LINEhash，例如 12ab；编辑时不要复制 | 或后面的内容到操作行。',
        '默认只读取 160 行；显式传 end_line 或 limit 时会自动附带前 1 行、后 3 行上下文。',
        '超长行会显示为 LINE|截断内容，不带 hash，表示这行不可作为 edit_file_canvas 锚点。',
        '编辑文件前必须先读取目标区域，复制左侧 LINEhash 锚点到 edit_file_canvas 的 hashline 输入。'
      ].join('\n'),
    inputSchema: z.object({
      path: z.string().describe('要读取的文件路径。相对路径会基于当前 Canvas 工作区解析。'),
      start_line: z.number().int().min(1).optional().describe('起始行号，1-based，默认 1。'),
      end_line: z.number().int().min(1).optional().describe('结束行号，1-based；传入后会自动附带少量上下文。'),
      limit: z.number().int().min(1).max(2000).optional().describe('最多读取多少行，默认 160，最大 2000。'),
      max_columns: z.number().int().min(20).max(2000).optional().describe('单行最大显示列数，默认 240；超出后不生成 hash 锚点。')
    }),
    execute: async (args: unknown, options?: { chatId?: string }) => {
      const params = args as { path?: string; start_line?: number; end_line?: number; limit?: number; max_columns?: number }
      const rawPath = String(params.path || '').trim()

      if (!rawPath) {
        return {
          error: '缺少必要参数: path',
          toolResult: {
            content: [{ type: 'text', text: 'read_canvas_file 失败：缺少必要参数 path' }]
          }
        }
      }

      try {
        openCanvasPanel()
        const { workspaceDir } = await ensureCanvasWorkspace(options?.chatId)
        const normalizedPath = normalizeCanvasEditPath(workspaceDir, rawPath)
        const result = await window.api.hashline.read({
          baseDir: workspaceDir,
          path: normalizedPath.slice(1),
          start_line: typeof params.start_line === 'number' ? params.start_line : undefined,
          end_line: typeof params.end_line === 'number' ? params.end_line : undefined,
          limit: typeof params.limit === 'number' ? params.limit : undefined,
          max_columns: typeof params.max_columns === 'number' ? params.max_columns : undefined
        })

        if (!result?.ok || !result.text) {
          throw new Error(result?.error || 'hashline read failed')
        }

        return {
          toolResult: {
            content: [{
              type: 'text',
              text: result.text
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
    description:
      [
        '使用 ripgrep(rg) 当前 Canvas 工作区中搜索指定代码或内容，返回匹配文件、行号和文本。必须使用 rg。',
        '常用模式：',
        '- 搜内容：rg -n "keyword" .',
        '- 搜文件名：rg --files | rg "keyword"',
        '- 限定目录或类型：rg -n "keyword" apps/desktop/src -g "*.ts" -g "*.vue"',
        '- 带上下文：rg -n "keyword" -C 3',
        '- 搜隐藏文件、ignore 文件或 node_modules：rg -uuu -n "keyword"',
        '- 输出可能很大时：加具体目录、-g/--glob、--max-count 或更精确关键词。',
      ].join('\n'),
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
        const { workspaceDir } = await ensureCanvasWorkspace(options?.chatId)
        const sandbox = await readCanvasSnapshotForSync(workspaceDir, options?.chatId)
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
        const syncedCanvas = await readCanvasSnapshotForSync(workspaceDir, options?.chatId)
        // 尽量保留用户之前选中的文件；如果那个文件已经不存在了，再退回到新的 activeFilePath。
        const nextActiveFilePath = sandbox?.activeFilePath && syncedCanvas?.files[sandbox.activeFilePath]
          ? sandbox.activeFilePath
          : syncedCanvas?.activeFilePath
        // 用工作区执行后的最新结果覆盖当前聊天里的 canvas。
        if (nextActiveFilePath) {
          canvasStore.setActiveFilePath(nextActiveFilePath, options?.chatId)
        } else {
          canvasStore.resetActiveFilePath(options?.chatId)
        }
        canvasStore.touchWorkspace(options?.chatId)
        // 生成一段新增/更新/删除统计，方便工具调用结果里快速理解发生了什么。
        const syncSummary = sandbox && syncedCanvas
          ? summarizeCanvasSync(sandbox.files, syncedCanvas.files)
          : '非临时工作区已跳过 Canvas 快照同步。'

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
  edit_file_canvas: {
    title: '编辑 Canvas 文件',
    description: [
      '使用 hashline 模式编辑当前 Canvas 工作区内的文件。',
      '',
      '输入格式：',
      '§path/to/file',
      '»ANCHOR 在锚点后插入；«ANCHOR 在锚点前插入；≔ANCHOR 或 ≔START..END 替换/删除行。',
      '操作符 + 锚点必须独占一行；payload 必须从下一行开始。不要写成 »12ab|payload。',
      '»BOF/«BOF 表示文件开头，»EOF 表示文件末尾。',
      '≔ANCHOR 后跟 payload 表示替换；不跟 payload 表示删除。',
      '',
      '编辑前必须用 read_canvas_file 获取最新 LINEhash 锚点。',
      '所有路径必须位于当前 Canvas 工作区内。'
    ].join('\n'),
    inputSchema: z.object({
      input: z.string().describe('hashline 编辑内容，必须包含一个或多个 §PATH 文件区块。')
    }),
    execute: async (args: unknown, options?: { chatId?: string }) => {
      const params = args as Record<string, any>
      const input = typeof params.input === 'string' ? params.input : ''

      if (!input.trim()) {
        return {
          error: '缺少必要参数: input',
          toolResult: {
            content: [{ type: 'text', text: 'edit_file_canvas 失败：缺少必要参数 input' }]
          }
        }
      }

      try {
        const canvasStore = useCanvasStore()
        const { workspaceDir } = await ensureCanvasWorkspace(options?.chatId)
        const result = await window.api.editFile.execute({
          baseDir: workspaceDir,
          input
        })

        if (!result?.ok || !result.summary) {
          throw new Error(result?.error || 'edit_file_canvas failed')
        }

        const firstSummaryPath = result.summary.split('\n')[0]?.replace(/^[A-Z]\s+/, '').trim()
        if (firstSummaryPath) {
          canvasStore.setActiveFilePath(normalizeCanvasEditPath(workspaceDir, firstSummaryPath), options?.chatId)
        } else {
          canvasStore.touchWorkspace(options?.chatId)
        }

        openCanvasPanel()

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
            content: [{ type: 'text', text: `edit_file_canvas 失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  }
})
