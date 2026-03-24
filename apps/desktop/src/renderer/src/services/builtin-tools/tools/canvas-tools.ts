import { z } from 'zod'
import { formatSandboxResult } from '@renderer/services/sandbox'

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
