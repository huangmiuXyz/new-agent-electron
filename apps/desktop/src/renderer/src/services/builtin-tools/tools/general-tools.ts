import { z } from 'zod'
import { getBuiltinTools } from '../index'

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

const toDisplayPath = (inputPath: string): string => inputPath.replaceAll('\\', '/')
const toDisplayRelativePath = (inputPath: string): string => {
  if (!inputPath) return '.'
  return toDisplayPath(inputPath)
}

const parallelToolUseSchema = z.object({
  recipient_name: z
    .string()
    .min(1)
    .describe(
      '要调用的工具名称。内置工具格式为 "builtin.<tool_name>"，MCP 工具格式为 "mcp.<server_name>.<tool_name>"。'
    ),
  parameters: z.record(z.string(), z.unknown()).describe('传递给目标工具的参数对象。')
})

const formatToolOutput = (value: unknown): string => {
  if (typeof value === 'string') return value

  const toolResult = (value as { toolResult?: { content?: Array<{ type?: string; text?: string }> } })?.toolResult
  if (toolResult && Array.isArray(toolResult.content)) {
    const text = toolResult.content
      .map((item) => (typeof item?.text === 'string' ? item.text : ''))
      .filter(Boolean)
      .join('\n')
    if (text) return text
  }

  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

const formatParallelToolUseInput = (toolUses: Array<z.infer<typeof parallelToolUseSchema>>): string => {
  return toolUses
    .map((toolUse, index) => {
      const parametersText = (() => {
        const params = toolUse.parameters || {}
        if (
          params &&
          typeof params === 'object' &&
          !Array.isArray(params) &&
          Object.keys(params).length === 1 &&
          typeof (params as { cmd?: unknown }).cmd === 'string'
        ) {
          return String((params as { cmd: string }).cmd)
        }

        try {
          return JSON.stringify(params, null, 2)
        } catch {
          return String(params)
        }
      })()

      return [
        `[${index + 1}] ${toolUse.recipient_name}`,
        'input:',
        parametersText
      ].join('\n')
    })
    .join('\n\n')
}

const formatParallelToolUseResults = (
  results: Array<{ recipient_name: string; output?: unknown; formatted_output?: string; error?: string }>
): string => {
  return results
    .map((result, index) => {
      if (result.error) {
        return [
          `[${index + 1}] ${result.recipient_name}`,
          'error:',
          result.error
        ].join('\n')
      }

      return [
        `[${index + 1}] ${result.recipient_name}`,
        'output:',
        result.formatted_output || ''
      ].join('\n')
    })
    .join('\n\n')
}

const getAvailableToolContext = (chatId?: string) => {
  const agentStore = useAgentStore()
  const settingsStore = useSettingsStore()
  const agent = getAgentByChat(chatId)
  const builtinToolNames = new Set(agent?.builtinTools || [])
  const mcpToolNames = new Set(agent?.tools || [])
  const mcpServers = agent?.id ? agentStore.getMcpByAgent(agent.id).mcpServers : settingsStore.mcpServers

  return {
    agent,
    builtinToolNames,
    mcpToolNames,
    mcpServers
  }
}

const parseRecipientName = (recipientName: string) => {
  const parts = recipientName.trim().split('.')
  const kind = parts[0]

  if (kind === 'builtin' && parts.length === 2) {
    return {
      kind: 'builtin' as const,
      toolName: parts[1]
    }
  }

  if (kind === 'mcp' && parts.length >= 3) {
    return {
      kind: 'mcp' as const,
      serverName: parts[1],
      toolName: parts.slice(2).join('.')
    }
  }

  throw new Error(
    `Invalid recipient_name "${recipientName}". Use "builtin.<tool_name>" or "mcp.<server_name>.<tool_name>".`
  )
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
                text: `当前路径: ${toDisplayPath(currentPath)}\n相对路径: ${toDisplayRelativePath(relativePath)}\n工作目录: ${baseDir ? toDisplayPath(baseDir) : '未设置'}`
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
  },
  'multi_tool_use_parallel': {
    title: '批量并行工具调用',
    description:
      '用于批量并行调用多个工具。只允许调用当前智能体已启用的内置工具或 MCP 工具。',
    inputSchema: z.object({
      tool_uses: z
        .array(parallelToolUseSchema)
        .min(1)
        .max(20)
        .describe('要并行执行的工具列表。')
    }),
    execute: async (
      args: unknown,
      options?: { toolCallId?: string; chatId?: string; model?: string; provider?: string }
    ) => {
      const params = args as {
        tool_uses?: Array<z.infer<typeof parallelToolUseSchema>>
      }
      const toolUses = Array.isArray(params.tool_uses) ? params.tool_uses : []

      if (toolUses.length === 0) {
        return {
          toolResult: {
            content: [{ type: 'text', text: 'multi_tool_use.parallel 执行失败：tool_uses 至少需要包含一个工具调用。' }]
          }
        }
      }

      const { agent, builtinToolNames, mcpToolNames, mcpServers } = getAvailableToolContext(options?.chatId)
      const builtinTools = getBuiltinTools({ knowledgeBaseIds: agent?.knowledgeBaseIds })
      const results = await Promise.all(
        toolUses.map(async (toolUse, index) => {
          try {
            const target = parseRecipientName(toolUse.recipient_name)

            if (toolUse.recipient_name === 'builtin.multi_tool_use.parallel') {
              throw new Error('multi_tool_use.parallel cannot call itself.')
            }

            if (target.kind === 'builtin') {
              if (!builtinToolNames.has(target.toolName)) {
                throw new Error(`Builtin tool "${target.toolName}" is not enabled for the current agent.`)
              }

              const tool = builtinTools[target.toolName]
              if (!tool?.execute) {
                throw new Error(`Builtin tool "${target.toolName}" was not found.`)
              }

              const output = await tool.execute(toolUse.parameters || {}, {
                toolCallId: `${options?.toolCallId || 'multi_tool_use.parallel'}:${index}`,
                chatId: options?.chatId || '',
                model: options?.model || '',
                provider: options?.provider || ''
              })

              return {
                recipient_name: toolUse.recipient_name,
                output,
                formatted_output: formatToolOutput(output)
              }
            }

            const allowedMcpKey = `${target.serverName}.${target.toolName}`
            if (!mcpToolNames.has(allowedMcpKey)) {
              throw new Error(`MCP tool "${allowedMcpKey}" is not enabled for the current agent.`)
            }

            const serverConfig = mcpServers[target.serverName]
            if (!serverConfig) {
              throw new Error(`MCP server "${target.serverName}" is not available.`)
            }

            const serverTools = await window.api.list_tools({ [target.serverName]: serverConfig }, false)
            const tool = serverTools[target.toolName]
            if (!tool?.execute) {
              throw new Error(`MCP tool "${allowedMcpKey}" was not found.`)
            }

            const output = await tool.execute(toolUse.parameters || {}, {
              toolCallId: `${options?.toolCallId || 'multi_tool_use.parallel'}:${index}`
            } as any)

            return {
              recipient_name: toolUse.recipient_name,
              output,
              formatted_output: formatToolOutput(output)
            }
          } catch (error) {
            return {
              recipient_name: toolUse.recipient_name,
              error: (error as Error).message
            }
          }
        })
      )

      return {
        toolResult: {
          content: [
            {
              type: 'text',
              text: [
                '批量并行工具调用完成',
                '',
                'tool_uses:',
                formatParallelToolUseInput(toolUses),
                '',
                'results:',
                formatParallelToolUseResults(results)
              ].join('\n')
            }
          ]
        }
      }
    }
  }
})
