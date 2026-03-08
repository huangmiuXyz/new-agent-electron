import { z } from 'zod'

const getAgentByChat = (chatId?: string) => {
  const chatsStore = useChatsStores()
  const agentStore = useAgentStore()
  const chat = chatId ? chatsStore.getChatById(chatId) : chatsStore.currentChat
  const agentId = chat?.agentId || 'default'
  return agentStore.getAgentById(agentId) || null
}

const resolvePath = (rawPath: string, chatId?: string): string => {
  const baseDir = getAgentByChat(chatId)?.terminalStartupPath
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

export const getGeneralBuiltinTools = (): Partial<Tools> => ({
  get_current_path: {
    title: '获取当前路径',
    description: '获取当前工作目录的路径',
    inputSchema: z.object({
      path: z
        .string()
        .optional()
        .default('.')
        .describe('可选的路径，默认获取当前工作目录，支持相对路径或绝对路径')
    }),
    execute: async (args: unknown, options?: { chatId?: string }) => {
      const params = args as Record<string, any>
      const rawPath = params.path || '.'

      try {
        const currentPath = resolvePath(rawPath, options?.chatId)
        const baseDir = getAgentByChat(options?.chatId)?.terminalStartupPath
        const relativePath = baseDir
          ? window.api.path.relative(baseDir, currentPath)
          : currentPath

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: `当前路径: ${currentPath}\n相对路径: ${relativePath || '.'}\n工作目录: ${baseDir || '未设置'}`
              }
            ]
          }
        }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `获取路径失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  calculator: {
    description: '执行基本的数学计算，支持加、减、乘、除等运算',
    inputSchema: z.object({
      expression: z.string().describe('要计算的数学表达式，例如 "2 + 3 * 4" 或 "sqrt(16)"')
    }),
    title: '计算器',
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const { expression } = params

      if (!expression) {
        throw new Error('表达式不能为空')
      }

      try {
        const safeExpression = expression
          .replace(/[^0-9+\-*/.()sqrt Math\spower^]/g, '')
          .replace(/sqrt/g, 'Math.sqrt')
          .replace(/\^/g, '**')

        const result = Function(`"use strict"; return (${safeExpression})`)()

        return {
          toolResult: {
            content: [{ type: 'text', text: `计算结果: ${result}\n表达式: ${expression}` }]
          }
        }
      } catch (error) {
        return {
          toolResult: {
            content: [
              { type: 'text', text: `计算错误: ${(error as Error).message}\n表达式: ${expression}` }
            ]
          }
        }
      }
    }
  },
  candidateReplies: {
    description: '生成对话界面中的候选回复选项',
    inputSchema: z.object({
      title: z.string().describe('候选回复的标题'),
      suggestions: z
        .array(
          z.object({
            id: z.string().describe('候选回复的唯一标识符'),
            text: z.string().describe('候选回复的文本内容'),
            action: z.string().optional().describe('候选回复的动作描述')
          })
        )
        .describe('候选回复列表，每个候选回复包含ID、文本和可选的动作描述')
    }),
    title: '候选回复生成器',
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const { title, suggestions } = params

      if (!title) {
        throw new Error('候选回复标题不能为空')
      }
      if (!suggestions || !Array.isArray(suggestions) || suggestions.length === 0) {
        throw new Error('必须提供候选回复一个建议')
      }
      for (const suggestion of suggestions) {
        if (!suggestion.id || !suggestion.text) {
          throw new Error('候选回复必须包含ID和文本内容')
        }
      }

      return {
        queueAsUserMessage: true,
        toolResult: {
          content: [{ type: 'text', text: '<|stop|>' }]
        }
      }
    }
  }
})
