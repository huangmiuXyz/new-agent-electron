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
  const normalizedWorkspaceDir = window.api.path.resolve(window.api.path.normalize(workspaceDir))
  const resolveRelativePath = (value: string) => {
    const resolvedPath = window.api.path.resolve(normalizedWorkspaceDir, value)
    return window.api.path.relative(normalizedWorkspaceDir, resolvedPath)
  }
  const getWorkspaceRelativePath = () => {
    if (!window.api.path.isAbsolute(noPrefixPath)) {
      return resolveRelativePath(noPrefixPath)
    }

    const resolvedPath = window.api.path.resolve(window.api.path.normalize(noPrefixPath))
    const absoluteRelativePath = window.api.path.relative(normalizedWorkspaceDir, resolvedPath)
    const isInsideWorkspace =
      absoluteRelativePath === '' ||
      (!absoluteRelativePath.startsWith('..') && !window.api.path.isAbsolute(absoluteRelativePath))

    if (isInsideWorkspace) {
      return absoluteRelativePath
    }

    // Canvas paths commonly use a leading slash to mean "workspace root", e.g. /index.html.
    return resolveRelativePath(noPrefixPath.replace(/^[/\\]+/, ''))
  }
  const relativePath = getWorkspaceRelativePath()
  const isInsideWorkspace =
    relativePath === '' ||
    (!relativePath.startsWith('..') && !window.api.path.isAbsolute(relativePath))

  if (!isInsideWorkspace) {
    throw new Error(`路径越界：仅允许访问 Canvas 工作区内文件 (${normalizedWorkspaceDir})`)
  }

  return normalizeSandboxPath(relativePath)
}

const normalizeCanvasEditInput = (workspaceDir: string, input: string) =>
  input.replace(/^¶([^\r\n]*)$/gm, (line: string, rawHeader: string) => {
    const separatorIndex = rawHeader.lastIndexOf('#')
    if (separatorIndex <= 0) return line
    const rawPath = rawHeader.slice(0, separatorIndex)
    const tag = rawHeader.slice(separatorIndex)
    const normalizedPath = normalizeCanvasEditPath(workspaceDir, rawPath)
    return `¶${normalizedPath.replace(/^\/+/, '')}${tag}`
  })

const nonEmptyString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim() ? value : undefined

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
      throw new Error(
        stderr || stdout.substring(0, 10000) || errorMessage || 'command execution failed'
      )
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
    description:
      '列出当前 Canvas 工作区中某个目录下的直接子目录和文件。需要搜索代码或内容时请使用 search_canvas_content；该搜索工具内部会使用 bundled ripgrep。',
    inputSchema: z.object({
      directory_path: z.string().optional().describe('要列出的目录路径，默认为 /')
    }),
    execute: async (args: unknown, options?: { chatId?: string }) => {
      const params = args as { directory_path?: string }

      try {
        openCanvasPanel()

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: formatDirectoryList(options?.chatId, params.directory_path || '/')
              }
            ]
          }
        }
      } catch (error) {
        return {
          error: (error as Error).message,
          toolResult: {
            content: [
              { type: 'text', text: `list_canvas_directory 失败: ${(error as Error).message}` }
            ]
          }
        }
      }
    }
  },
  read_canvas_file: {
    title: '读取 Canvas 文件',
    description: [
      '读取当前 Canvas 工作区中的文本文件，并以 hashline 格式返回。',
      'hashlines 会包含文件头 ¶path#TAG，TAG 是当前文件快照指纹，编辑时必须原样复制。',
      '正文每一行格式为 LINE:内容，例如 12:const value = 1。编辑操作使用行号 12。',
      '默认只读取 160 行；显式传 end_line 或 limit 时会自动附带前 1 行、后 3 行上下文。',
      '超长行会截断显示，但仍可用行号编辑；提交前请确认目标行内容。',
      '编辑文件前必须先读取目标区域，复制 ¶path#TAG 文件头到 edit_file_canvas 的 content。'
    ].join('\n'),
    inputSchema: z.object({
      path: z.string().describe('要读取的文件路径。相对路径会基于当前 Canvas 工作区解析。'),
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
    execute: async (args: unknown, options?: { chatId?: string }) => {
      const params = args as {
        path?: string
        start_line?: number
        end_line?: number
        limit?: number
        max_columns?: number
      }
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
    description: [
      'Canvas 内容搜索工具。在当前 Canvas 工作区中搜索指定代码或文本，返回匹配文件、行号和文本。',
      '搜索代码或内容时必须调用 search_canvas_content，不要改用 exec_command_canvas 执行 rg/grep。',
      '本工具内部会使用 bundled ripgrep，不依赖 shell PATH 中是否存在 rg。',
      'query 传要查找的关键词或文本片段；输出可能很大时，请使用更精确的 query 或调低 max_results。'
    ].join('\n'),
    inputSchema: z.object({
      query: z.string().describe('要搜索的关键词或文本片段'),
      case_sensitive: z.boolean().optional().default(false).describe('是否区分大小写，默认 false'),
      max_results: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .default(20)
        .describe('最多返回多少条结果，默认 20')
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
            content: [
              {
                type: 'text',
                text: await searchCanvasContent(workspaceDir, String(params.query || ''), {
                  caseSensitive: params.case_sensitive,
                  maxResults: params.max_results
                })
              }
            ]
          }
        }
      } catch (error) {
        return {
          error: (error as Error).message,
          toolResult: {
            content: [
              { type: 'text', text: `search_canvas_content 失败: ${(error as Error).message}` }
            ]
          }
        }
      }
    }
  },
  exec_command_canvas: {
    title: '在 Canvas 工作区执行命令',
    description: [
      '在现有 Canvas 终端会话中执行测试、构建、包管理、脚本等真正需要终端的命令。',
      '不要用 exec_command_canvas 搜索或读取 Canvas 文件：搜索代码/内容请用 search_canvas_content，读取文件请用 read_canvas_file，编辑文件请用 edit_file_canvas。',
      'search_canvas_content 内部会使用 bundled ripgrep，不依赖 shell PATH 中是否存在 rg；读取文件时不要用 cat/sed/head/tail/nl。',
      '首次调用可不传 terminal_id 来创建新终端；一旦工具返回了终端ID，后续相关命令应优先复用同一个 terminal_id。'
    ].join('\n'),
    inputSchema: z.object({
      command: z.string().describe('要执行的命令'),
      terminal_id: z
        .string()
        .optional()
        .describe(
          '要复用的终端ID。留空时会创建新终端；如果之前已返回 terminal_id，后续同一任务应复用该 ID。'
        )
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
        const nextActiveFilePath =
          sandbox?.activeFilePath && syncedCanvas?.files[sandbox.activeFilePath]
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
        const syncSummary =
          sandbox && syncedCanvas
            ? summarizeCanvasSync(sandbox.files, syncedCanvas.files)
            : '非临时工作区已跳过 Canvas 快照同步。'

        // 返回给模型和界面的结果里包含终端ID、工作区路径、同步摘要和命令输出。
        return {
          toolResult: {
            content: [
              {
                type: 'stdout',
                text:
                  `终端ID: ${tabId}\n` +
                  `cmd: ${command}\n` +
                  `${resolvedCommand !== command ? `resolved_cmd: ${resolvedCommand}\n` : ''}` +
                  `Canvas 工作区: ${workspaceDir.replaceAll('\\', '/')}\n` +
                  `${syncSummary}\n` +
                  '后续如果要在同一终端继续执行命令，请复用这个终端ID。\n' +
                  `${result?.output || ''}`
              }
            ]
          }
        }
      } catch (error) {
        // 兜底把运行期错误转成工具协议可消费的失败结果。
        return {
          error: (error as Error).message,
          toolResult: {
            content: [
              { type: 'text', text: `exec_command_canvas 失败: ${(error as Error).message}` }
            ]
          }
        }
      }
    }
  },
  edit_file_canvas: {
    title: '编辑 Canvas 文件',
    description: [
      '编辑当前 Canvas 工作区内的文件。用 type 区分文件操作：update/add/delete/move。',
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
      'update 前必须用 read_canvas_file 获取最新 ¶path#TAG 文件头和行号。payload 每行必须以 + 开头，+ 单独一行表示插入空行。',
      '成功后会返回 old_hash/new_hash；下一次编辑同文件可直接用 new_hash 构造新的 ¶path#TAG 文件头；如果提示 snapshot mismatch，再调用 read_canvas_file 重读。',
      '所有路径必须位于当前 Canvas 工作区内。'
    ].join('\n'),
    inputSchema: z.object({
      type: z
        .enum(['update', 'add', 'delete', 'move'])
        .optional()
        .default('update')
        .describe('文件操作类型。update 走 hashline；add/delete/move 是文件级操作。'),
      path: z
        .string()
        .optional()
        .describe('type=add/delete/move 时的源/目标文件路径。相对路径基于当前 Canvas 工作区。'),
      new_path: z
        .string()
        .optional()
        .describe('type=move 时的新文件路径。相对路径基于当前 Canvas 工作区。'),
      content: z
        .string()
        .optional()
        .describe('type=update 时的 hashline 编辑内容；type=add 时的新文件内容。')
    }),
    execute: async (args: unknown, options?: { chatId?: string }) => {
      const params = args as Record<string, any>
      const type = ['update', 'add', 'delete', 'move'].includes(params.type)
        ? params.type
        : 'update'
      const content = typeof params.content === 'string' ? params.content : ''
      const input = type === 'update' ? content : ''

      if (type === 'update' && !input.trim()) {
        return {
          error: '缺少必要参数: content',
          toolResult: {
            content: [
              { type: 'text', text: 'edit_file_canvas 失败：type=update 缺少必要参数 content' }
            ]
          }
        }
      }

      try {
        const canvasStore = useCanvasStore()
        const { workspaceDir } = await ensureCanvasWorkspace(options?.chatId)
        const normalizedInput =
          type === 'update' ? normalizeCanvasEditInput(workspaceDir, input) : input
        const rawPath = nonEmptyString(params.path)
        const rawNewPath = type === 'move' ? nonEmptyString(params.new_path) : undefined
        const normalizedPath = rawPath
          ? normalizeCanvasEditPath(workspaceDir, rawPath).replace(/^\/+/, '')
          : undefined
        const normalizedNewPath = rawNewPath
          ? normalizeCanvasEditPath(workspaceDir, rawNewPath).replace(/^\/+/, '')
          : undefined
        const result = await window.api.editFile.execute({
          baseDir: workspaceDir,
          type,
          input: normalizedInput,
          path: normalizedPath,
          new_path: normalizedNewPath,
          content: type === 'add' ? content : undefined
        })

        if (!result?.ok || !result.summary) {
          throw new Error(result?.error || 'edit_file_canvas failed')
        }

        const firstChange = result.changes?.[0]
        const firstChangePath =
          firstChange?.status === 'R' && firstChange.new_path
            ? firstChange.new_path
            : firstChange?.path
        const firstSummaryPath =
          type === 'move'
            ? normalizedNewPath || firstChangePath
            : type === 'add'
              ? normalizedPath || firstChangePath
              : type === 'delete'
                ? ''
                : firstChangePath
        if (firstSummaryPath) {
          canvasStore.setActiveFilePath(
            normalizeCanvasEditPath(workspaceDir, firstSummaryPath),
            options?.chatId
          )
        }
        canvasStore.touchWorkspace(options?.chatId)

        openCanvasPanel()

        const diffText = result.changes?.[0]?.diff || result.summary
        return {
          summary: result.summary,
          toolResult: {
            content: [{ type: 'text', text: diffText }]
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
