import { z } from 'zod'
import {
  buildSandboxTree,
  ensureSandboxTempWorkspaceAsync,
  normalizeSandboxPath,
  readSandboxWorkspaceAsync,
  sortSandboxFiles
} from '@renderer/services/sandbox'

const ensureCanvasTempWorkspace = (chatId?: string) => {
  const canvasStore = useCanvasStore()
  const sandbox = canvasStore.getCanvas(chatId)
  const workspaceId = chatId || 'default'
  return ensureSandboxTempWorkspaceAsync(sandbox, workspaceId).then((workspaceDir) => ({ sandbox, workspaceDir }))
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
  const sandbox = canvasStore.getCanvas(chatId)
  const normalizedDirectoryPath = normalizeDirectoryPath(directoryPath)
  const tree = buildSandboxTree(sandbox)

  const findNode = (nodes: ReturnType<typeof buildSandboxTree>, targetPath: string) => {
    for (const node of nodes) {
      if (node.path === targetPath) return node
      if (node.children?.length) {
        const matched = findNode(node.children, targetPath)
        if (matched) return matched
      }
    }
    return null
  }

  const targetChildren = normalizedDirectoryPath === '/'
    ? tree
    : findNode(tree, normalizedDirectoryPath)?.children

  if (!targetChildren) {
    throw new Error(`目录不存在: ${normalizedDirectoryPath}`)
  }

  if (targetChildren.length === 0) {
    return `目录 ${normalizedDirectoryPath} 为空。`
  }

  const lines = targetChildren.map((node) => {
    if (node.type === 'directory') {
      return `[DIR] ${node.path}`
    }

    const file = sandbox.files[node.path]
    if (!file) return `[FILE] ${node.path}`
    if (file.encoding === 'data-url') {
      return `[FILE] ${node.path} (${file.mediaType || 'application/octet-stream'}, binary)`
    }
    return `[FILE] ${node.path}`
  })

  return [`目录: ${normalizedDirectoryPath}`, ...lines].join('\n')
}

const formatCanvasFileContent = (
  chatId: string | undefined,
  filePath: string,
  options?: { startLine?: number; endLine?: number }
) => {
  const canvasStore = useCanvasStore()
  const sandbox = canvasStore.getCanvas(chatId)
  const normalizedFilePath = normalizeSandboxPath(filePath)
  const file = sandbox.files[normalizedFilePath]

  if (!file) {
    throw new Error(`文件不存在: ${normalizedFilePath}`)
  }

  if (file.encoding === 'data-url') {
    return `文件: ${normalizedFilePath}\n[binary ${file.mediaType || 'application/octet-stream'}]`
  }

  const lines = file.content.split('\n')
  const hasLineRange = options?.startLine !== undefined || options?.endLine !== undefined
  const startLine = Math.max(1, options?.startLine || 1)
  const endLine = Math.max(startLine, options?.endLine || lines.length)
  const slicedLines = hasLineRange ? lines.slice(startLine - 1, endLine) : lines
  const content = slicedLines.join('\n')
  const header = hasLineRange
    ? `文件: ${normalizedFilePath} (lines ${startLine}-${Math.min(endLine, lines.length)})`
    : `文件: ${normalizedFilePath}`

  return `${header}\n\`\`\`${'text'}\n${content}\n\`\`\``
}

const searchCanvasContent = (
  chatId: string | undefined,
  query: string,
  options?: { caseSensitive?: boolean; maxResults?: number }
) => {
  const canvasStore = useCanvasStore()
  const sandbox = canvasStore.getCanvas(chatId)
  const keyword = String(query || '')
  if (!keyword.trim()) {
    throw new Error('缺少必要参数: query')
  }

  const caseSensitive = Boolean(options?.caseSensitive)
  const maxResults = Math.max(1, Math.min(options?.maxResults || 20, 100))
  const needle = caseSensitive ? keyword : keyword.toLowerCase()
  const matches: string[] = []

  for (const file of sortSandboxFiles(sandbox)) {
    if (file.encoding === 'data-url') continue
    const lines = file.content.split('\n')

    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index] || ''
      const haystack = caseSensitive ? line : line.toLowerCase()
      if (!haystack.includes(needle)) continue

      matches.push(`${file.path}:${index + 1}: ${line}`)
      if (matches.length >= maxResults) {
        return [`搜索: ${keyword}`, ...matches, `已达到结果上限 ${maxResults} 条。`].join('\n')
      }
    }
  }

  if (matches.length === 0) {
    return `未在 sandbox 中找到包含 ${keyword} 的内容。`
  }

  return [`搜索: ${keyword}`, ...matches].join('\n')
}

export const getCanvasBuiltinTools = (): Partial<Tools> => ({
  list_canvas_directory: {
    title: '列出 Canvas 目录',
    description: '列出当前会话 sandbox 中某个目录下的直接子目录和文件。',
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
    description: '读取当前会话 sandbox 中某个指定文件的内容，可按行范围读取。',
    inputSchema: z.object({
      file_path: z.string().describe('要读取的文件路径'),
      start_line: z.number().int().min(1).optional().describe('起始行号，1-based，可选'),
      end_line: z.number().int().min(1).optional().describe('结束行号，1-based，可选')
    }),
    execute: async (args: unknown, options?: { chatId?: string }) => {
      const params = args as { file_path?: string; start_line?: number; end_line?: number }
      const filePath = String(params.file_path || '').trim()

      if (!filePath) {
        return {
          error: '缺少必要参数: file_path',
          toolResult: {
            content: [{ type: 'text', text: 'read_canvas_file 失败：缺少必要参数 file_path' }]
          }
        }
      }

      try {
        openCanvasPanel()

        return {
          toolResult: {
            content: [{
              type: 'text',
              text: formatCanvasFileContent(options?.chatId, filePath, {
                startLine: params.start_line,
                endLine: params.end_line
              })
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
    description: '在当前会话 sandbox 的文本文件中搜索指定内容，返回匹配文件、行号和文本。',
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

        return {
          toolResult: {
            content: [{
              type: 'text',
              text: searchCanvasContent(options?.chatId, String(params.query || ''), {
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
      '把当前会话 sandbox 文件同步到临时工作区后执行命令。命令会以该工作区为当前目录运行，因此可以直接用相对路径引用 canvas 文件，例如 `type index.html`、`node main.js`、`python scripts/build.py`。',
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
        // 先把当前 canvas 文件写到临时工作区，并拿到同步前的原始快照用于后面对比。
        const { sandbox, workspaceDir } = await ensureCanvasTempWorkspace(options?.chatId)
        // 复用全局终端能力，在已有终端标签或新终端标签里执行命令。
        const { createTab } = useTerminal()
        // 在临时工作区作为 cwd 的前提下执行命令，这样命令里可以直接用相对路径。
        const { id: tabId, result } = await createTab({
          command,
          cwd: workspaceDir,
          promptLabel: 'canvas',
          id: params.terminal_id,
          toolCallId: options?.toolCallId,
          showTerminal: true
        })
        // 命令执行结束后，把临时工作区里的最新文件重新读回成 canvas 状态。
        const syncedCanvas = await readSandboxWorkspaceAsync(workspaceDir)
        // 尽量保留用户之前选中的文件；如果那个文件已经不存在了，再退回到新的 activeFilePath。
        const nextActiveFilePath = sandbox.activeFilePath && syncedCanvas.files[sandbox.activeFilePath]
          ? sandbox.activeFilePath
          : syncedCanvas.activeFilePath
        // 用工作区执行后的最新结果覆盖当前聊天里的 canvas。
        canvasStore.replaceCanvas(
          {
            ...syncedCanvas,
            activeFilePath: nextActiveFilePath
          },
          options?.chatId
        )
        // 生成一段新增/更新/删除统计，方便工具调用结果里快速理解发生了什么。
        const syncSummary = summarizeCanvasSync(sandbox.files, syncedCanvas.files)

        // 返回给模型和界面的结果里包含终端ID、工作区路径、同步摘要和命令输出。
        return {
          toolResult: {
            content: [{
              type: 'stdout',
              text:
                `终端ID: ${tabId}\n` +
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
    title: '搜索和替换 Sandbox',
    description:
      '在当前会话 sandbox 中执行文件操作：modify(替换内容)、add(新增文件)、delete(删除文件)、move(移动/重命名文件)。',
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
