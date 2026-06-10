import { z } from 'zod'
import { getBuiltinTools } from '../index'

const getAgentByChat = (chatId?: string) => {
  const chatsStore = useChatsStores()
  const agentStore = useAgentStore()
  const chat = chatId ? chatsStore.getChatById(chatId) : chatsStore.currentChat
  const agentId = chat?.agentId || 'default'
  return agentStore.getAgentById(agentId) || null
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
  const chatsStore = useChatsStores()
  const agent = getAgentByChat(chatId)
  const chat = chatId ? chatsStore.getChatById(chatId) : chatsStore.currentChat
  const builtinToolNames = new Set(
    (agent?.builtinTools || []).filter(
      (toolName) =>
        toolName !== 'agent_communicate' &&
        toolName !== 'finish_sub_task' &&
        !(chat?.parentChatId && toolName === 'delegate_to_sub_agent')
    )
  )
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
    description: [
      '用于批量并行调用多个工具。只允许调用当前智能体已启用的内置工具或 MCP 工具。',
      '当需要读取多个已知文件、小范围行号，或执行多个独立 search_project 查询时必须优先使用它，避免串行逐个调用。',
      '每个 tool_uses 条目都要写 recipient_name 和 parameters，例如 recipient_name="builtin.readFile"。'
    ].join('\n'),
    inputSchema: z.object({
      tool_uses: z
        .array(parallelToolUseSchema)
        .min(1)
        .max(20)
        .describe('要并行执行的工具列表。')
    }),
    execute: async (
      args: unknown,
      options?: {
        toolCallId?: string
        chatId?: string
        model?: string
        provider?: string
        availableBuiltinTools?: string[]
      }
    ) => {
      const params = args as {
        tool_uses?: Array<z.infer<typeof parallelToolUseSchema>>
      }
      const toolUses = Array.isArray(params.tool_uses) ? params.tool_uses : []

      if (toolUses.length === 0) {
        return {
          toolResult: {
            content: [{ type: 'text', text: 'multi_tool_use_parallel 执行失败：tool_uses 至少需要包含一个工具调用。' }]
          }
        }
      }

      const { agent, builtinToolNames, mcpToolNames, mcpServers } = getAvailableToolContext(options?.chatId)
      const builtinTools = getBuiltinTools({
        knowledgeBaseIds: agent?.knowledgeBaseIds,
        builtinToolConfigs: agent?.builtinToolConfigs
      })
      const results = await Promise.all(
        toolUses.map(async (toolUse, index) => {
          try {
            const target = parseRecipientName(toolUse.recipient_name)

            if (toolUse.recipient_name === 'builtin.multi_tool_use_parallel') {
              throw new Error('multi_tool_use_parallel cannot call itself.')
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
                toolCallId: `${options?.toolCallId || 'multi_tool_use_parallel'}:${index}`,
                chatId: options?.chatId || '',
                model: options?.model || '',
                provider: options?.provider || '',
                availableBuiltinTools: Array.from(builtinToolNames)
              } as any)

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
              toolCallId: `${options?.toolCallId || 'multi_tool_use_parallel'}:${index}`
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
