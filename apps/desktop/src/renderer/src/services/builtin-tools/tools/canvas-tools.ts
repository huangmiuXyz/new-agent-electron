import { z } from 'zod'
import { createSandboxState, formatSandboxResult, normalizeSandboxPath, sortSandboxFiles } from '@renderer/services/sandbox'

const isWindows = navigator.platform.toLowerCase().includes('win')

const ensureCanvasTempWorkspace = (chatId?: string) => {
  const canvasStore = useCanvasStore()
  const sandbox = canvasStore.getCanvas(chatId)
  const tempRoot = window.api.path.join(window.api.getPath('temp'), 'agent-qi-canvas-exec')
  const workspaceId = chatId || 'default'
  const workspaceDir = window.api.path.join(tempRoot, workspaceId)

  window.api.fs.mkdirSync(workspaceDir, { recursive: true })

  const existingEntries = window.api.fs.readdirSync(workspaceDir, { withFileTypes: true })
  for (const entry of existingEntries) {
    window.api.fs.rmSync(window.api.path.join(workspaceDir, entry.name), { recursive: true, force: true })
  }

  sortSandboxFiles(sandbox).forEach((file) => {
    const relativePath = file.path.replace(/^\/+/, '')
    if (!relativePath) return

    const outputPath = window.api.path.join(workspaceDir, ...relativePath.split('/'))
    const parentDir = window.api.path.dirname(outputPath)
    window.api.fs.mkdirSync(parentDir, { recursive: true })
    window.api.fs.writeFileSync(outputPath, file.content, 'utf-8')
  })

  return { sandbox, workspaceDir }
}

const readCanvasWorkspace = (workspaceDir: string) => {
  const nextState = createSandboxState()
  const fileEntries: Record<string, { path: string; content: string; updatedAt: number }> = {}

  const walk = (currentDir: string) => {
    const entries = window.api.fs.readdirSync(currentDir, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = window.api.path.join(currentDir, entry.name)
      const stat = window.api.fs.statSync(fullPath)
      const entryType = stat.mode & 0o170000
      const isDirectory = entryType === 0o040000
      const isFile = entryType === 0o100000

      if (isDirectory) {
        walk(fullPath)
        continue
      }

      if (!isFile) continue

      const relativePath = window.api.path.relative(workspaceDir, fullPath).replaceAll('\\', '/')
      const sandboxPath = normalizeSandboxPath(relativePath)
      const content = window.api.fs.readFileSync(fullPath, 'utf-8')

      fileEntries[sandboxPath] = {
        path: sandboxPath,
        content,
        updatedAt: stat.mtimeMs || Date.now()
      }
    }
  }

  walk(workspaceDir)

  nextState.files = fileEntries
  nextState.updatedAt = Date.now()
  nextState.activeFilePath = sortSandboxFiles(nextState)[0]?.path || ''

  return nextState
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

const wrapCanvasCommand = (command: string, workspaceDir: string) => {
  if (isWindows) {
    const escapedWorkspaceDir = workspaceDir.replaceAll("'", "''")
    return `Set-Location -LiteralPath '${escapedWorkspaceDir}'; ${command}`
  }

  const escapedWorkspaceDir = workspaceDir.replaceAll("'", "'\"'\"'")
  return `cd '${escapedWorkspaceDir}' && ${command}`
}

const openCanvasPanel = () => {
  const settingsStore = useSettingsStore()
  settingsStore.display.speechSidebarCollapsed = false
  settingsStore.display.assistantSidebarTab = 'canvas'
}

export const getCanvasBuiltinTools = (): Partial<Tools> => ({
  read_canvas: {
    title: '读取 Sandbox',
    description: '读取当前会话 sandbox 中的全部文件内容。',
    inputSchema: z.object({}),
    execute: async (_args: unknown, options?: { chatId?: string }) => {
      const canvasStore = useCanvasStore()
      const sandbox = canvasStore.getCanvas(options?.chatId)

      openCanvasPanel()

      return {
        toolResult: {
          content: [{ type: 'text', text: formatSandboxResult(sandbox) }]
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
      const params = args as {
        command?: string
        terminal_id?: string
      }
      const command = String(params.command || '').trim()

      if (!command) {
        return {
          error: '缺少必要参数: command',
          toolResult: {
            content: [{ type: 'text', text: 'exec_command_canvas 失败：缺少必要参数 command' }]
          }
        }
      }

      try {
        openCanvasPanel()

        const canvasStore = useCanvasStore()
        const { sandbox, workspaceDir } = ensureCanvasTempWorkspace(options?.chatId)
        const { createTab } = useTerminal()
        const wrappedCommand = wrapCanvasCommand(command, workspaceDir)
        const { id: tabId, result } = await createTab({
          command: wrappedCommand,
          id: params.terminal_id,
          toolCallId: options?.toolCallId,
          showTerminal: true
        })
        const syncedCanvas = readCanvasWorkspace(workspaceDir)
        const nextActiveFilePath = sandbox.activeFilePath && syncedCanvas.files[sandbox.activeFilePath]
          ? sandbox.activeFilePath
          : syncedCanvas.activeFilePath
        canvasStore.replaceCanvas(
          {
            ...syncedCanvas,
            activeFilePath: nextActiveFilePath
          },
          options?.chatId
        )
        const syncSummary = summarizeCanvasSync(sandbox.files, syncedCanvas.files)

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
