import { z } from 'zod'

const openCanvasPanel = () => {
  const settingsStore = useSettingsStore()
  settingsStore.display.speechSidebarCollapsed = false
  settingsStore.display.assistantSidebarTab = 'canvas'
}

const formatCanvasHtmlResult = (html: string) => {
  if (!html.trim()) {
    return '当前画布为空。'
  }

  return `当前画布 HTML 如下：\n\`\`\`html\n${html}\n\`\`\``
}

export const getCanvasBuiltinTools = (): Partial<Tools> => ({
  read_canvas: {
    title: '读取画布',
    description: '读取当前会话画布中的 HTML 内容。',
    inputSchema: z.object({}),
    execute: async (_args: unknown, options?: { chatId?: string }) => {
      const canvasStore = useCanvasStore()
      const html = canvasStore.getCanvasHtml(options?.chatId)

      openCanvasPanel()

      return {
        toolResult: {
          content: [{ type: 'text', text: formatCanvasHtmlResult(html) }]
        }
      }
    }
  },
  search_replace_canvas: {
    title: '查找替换画布',
    description: '在当前会话画布 HTML 中查找 old_str 并替换为 new_str，行为参考 Codex 的 search_replace。',
    inputSchema: z.object({
      old_str: z.string().describe('要搜索的旧 HTML 片段，必须与当前画布内容完全匹配。'),
      new_str: z.string().describe('用于替换的新 HTML 片段。')
    }),
    execute: async (args: unknown, options?: { chatId?: string }) => {
      const params = args as { old_str?: string; new_str?: string }
      const hasOldStr = typeof params.old_str === 'string'
      const oldStr = hasOldStr ? params.old_str as string : ''
      const newStr = typeof params.new_str === 'string' ? params.new_str : ''
      const canvasStore = useCanvasStore()
      const currentHtml = canvasStore.getCanvasHtml(options?.chatId)

      if (!hasOldStr) {
        return {
          error: '缺少必要参数: old_str',
          toolResult: {
            content: [{ type: 'text', text: 'search_replace 失败：缺少必要参数 old_str' }]
          }
        }
      }

      if (!currentHtml.includes(oldStr)) {
        return {
          error: 'old_str was not found in the canvas',
          toolResult: {
            content: [{
              type: 'text',
              text: 'search_replace 失败：old_str 未在当前画布中找到，请确保片段完全匹配。'
            }]
          }
        }
      }

      const nextHtml = currentHtml.replace(oldStr, newStr)
      canvasStore.setCanvasHtml(nextHtml, options?.chatId)
      openCanvasPanel()

      return {
        summaries: [`Successfully replaced content in canvas (${nextHtml.length} chars)`],
        toolResult: {
          content: [{
            type: 'text',
            text: `Successfully replaced content in canvas (${nextHtml.length} chars)`
          }]
        }
      }
    }
  }
})
