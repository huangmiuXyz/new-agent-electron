import { z } from 'zod'
import { createLoadSkillTool, type SkillMetadata } from '../../skillsService'
import { getBuiltinTools } from '..'
import { getCodexBuiltinTools } from './codex-tools'
import { getComputerBuiltinTools } from './computer-tools'
import { getGeneralBuiltinTools } from './general-tools'
import { getKnowledgeBuiltinTools } from './knowledge-tools'
import { getMediaBuiltinTools } from './media-tools'
import { getNetworkBuiltinTools } from './network-tools'

const MAX_RESOURCE_LINES = 40

const formatResourceList = (
  lines: string[],
  emptyText: string,
  options?: { maxLines?: number }
): string => {
  if (lines.length === 0) return emptyText
  const maxLines = options?.maxLines ?? MAX_RESOURCE_LINES
  const visibleLines = lines.slice(0, maxLines)
  const overflowCount = lines.length - visibleLines.length
  return [
    ...visibleLines,
    ...(overflowCount > 0 ? [`- 其余 ${overflowCount} 项请以当前设置页配置为准`] : [])
  ].join('\n')
}

const buildBuiltinToolReference = (
  skills: SkillMetadata[],
  agentToolsWithoutCreator: Partial<Tools>
): string => {
  const toolGroups: Array<{ group: string; tools: Partial<Tools> }> = [
    { group: '通用工具', tools: getGeneralBuiltinTools() },
    { group: '电脑操作', tools: getComputerBuiltinTools() },
    { group: 'Agent工具', tools: agentToolsWithoutCreator },
    { group: '网络工具', tools: getNetworkBuiltinTools() },
    { group: '知识库', tools: getKnowledgeBuiltinTools() },
    { group: '多媒体工具', tools: getMediaBuiltinTools() },
    { group: 'Codex工具', tools: getCodexBuiltinTools() }
  ]

  const lines = toolGroups.flatMap(({ group, tools }) =>
    Object.entries(tools).map(([toolKey, tool]) => {
      const title = tool?.title || toolKey
      const description = tool?.description || '无描述'
      return `- ${toolKey} | ${title} | 分组: ${group} | ${description}`
    })
  )

  return formatResourceList(lines, '当前没有可用内置工具。')
}

const buildMcpServerReference = (): {
  serverLines: string[]
  toolLines: string[]
} => {
  const settingsStore = useSettingsStore()
  const serverEntries = Object.entries(settingsStore.mcpServers || {})

  const serverLines = serverEntries.map(([serverName, server]) => {
    const serverLike = server as typeof server & { command?: string; url?: string }
    const transport =
      server.transport || (serverLike.command ? 'stdio' : serverLike.url ? 'http/sse' : 'unknown')
    const description = server.description || serverLike.command || serverLike.url || '无描述'
    const toolCount =
      server.tools && typeof server.tools === 'object' ? Object.keys(server.tools).length : 0
    return `- ${serverName} | transport: ${transport} | tools: ${toolCount} | ${description}`
  })

  const toolLines = serverEntries.flatMap(([serverName, server]) => {
    if (!server.tools || typeof server.tools !== 'object') return []
    return Object.entries(server.tools).map(([toolName, tool]) => {
      const title = tool?.title || toolName
      const description = tool?.description || '无描述'
      return `- ${serverName}.${toolName} | ${title} | ${description}`
    })
  })

  return { serverLines, toolLines }
}

const buildKnowledgeBaseReference = (): string => {
  const knowledgeStore = useKnowledgeStore()
  const lines = (knowledgeStore.knowledgeBases || []).map((knowledgeBase) => {
    const description = knowledgeBase.description?.trim() || '无描述'
    return `- ${knowledgeBase.id} | ${knowledgeBase.name} | ${description}`
  })

  return formatResourceList(lines, '当前没有可选知识库。')
}

const buildSkillReference = (skills: SkillMetadata[]): string => {
  const lines = skills.map((skill) => `- ${skill.name} | ${skill.description} | ${skill.path}`)
  return formatResourceList(lines, '当前没有可选技能。')
}

const buildAgentCreatorDescription = (
  skills: SkillMetadata[],
  agentToolsWithoutCreator: Partial<Tools>
): string => {
  const { serverLines, toolLines } = buildMcpServerReference()

  return [
    '创建一个新的智能体，并可直接从当前系统配置中选择内置工具、MCP 服务器、MCP 工具、技能和知识库。',
    '规则：',
    '- `tools` 只能填写已选 `mcpServers` 对应的工具，格式为 `server.tool`。',
    '- `skills` 填要启用的技能名；未传表示保持当前目录下技能默认全部启用。',
    '- `knowledgeBaseIds` 为空时建议同时关闭 `ragEnabled`。',
    '',
    '当前可选内置工具：',
    buildBuiltinToolReference(skills, agentToolsWithoutCreator),
    '',
    '当前可选 MCP 服务器：',
    formatResourceList(serverLines, '当前没有已配置的 MCP 服务器。'),
    '',
    '当前可选 MCP 工具：',
    formatResourceList(toolLines, '当前所配置的 MCP 服务器还没有加载出工具。'),
    '',
    '当前可选技能：',
    buildSkillReference(skills),
    '',
    '当前可选知识库：',
    buildKnowledgeBaseReference()
  ].join('\n')
}

const createAgentCommunicateTool = (): Tool => ({
  title: '智能体通信',
  description: '在主智能体与子智能体之间发送消息，消息会进入目标会话的通信队列',
  inputSchema: z.object({
    message: z.string().describe('发送内容'),
    targetAgentName: z
      .string()
      .optional()
      .describe('目标子智能体名称。子智能体可不传（默认发给主智能体）；主智能体回信时建议提供'),
    isFinal: z.boolean().optional().default(false).describe('是否为最终结论'),
    success: z
      .boolean()
      .optional()
      .default(true)
      .describe('最终结论是否成功（isFinal=true 时生效）'),
    error: z.string().optional().describe('失败原因（isFinal=true 且 success=false 时建议填写）')
  }),
  execute: async (args: unknown, options: { chatId: string }) => {
    const params = args as Record<string, any>
    const chatsStore = useChatsStores()
    const senderChat = chatsStore.getChatById(options.chatId)
    if (!senderChat) {
      return { toolResult: { content: [{ type: 'text', text: '通信失败：未找到当前会话。' }] } }
    }

    const message = String(params.message || '').trim()
    if (!message) {
      return { toolResult: { content: [{ type: 'text', text: '通信失败：message 不能为空。' }] } }
    }

    const agentStore = useAgentStore()
    const senderAgentName =
      agentStore.getAgentById(senderChat.agentId || '')?.name || senderChat.title || '未知智能体'
    const isSubSender = !!senderChat.parentChatId
    const targetAgentName = String(params.targetAgentName || '').trim()

    let targetChatId = ''
    let targetAgentLabel = ''
    if (isSubSender) {
      targetChatId = senderChat.parentChatId!
      const targetChat = chatsStore.getChatById(targetChatId)
      targetAgentLabel =
        agentStore.getAgentById(targetChat?.agentId || '')?.name || targetChat?.title || '主智能体'
    } else {
      const childChats = chatsStore.getChildChats(senderChat.id)
      if (childChats.length === 0) {
        return {
          toolResult: {
            content: [{ type: 'text', text: '通信失败：当前主会话没有可通信的子智能体。' }]
          }
        }
      }

      if (!targetAgentName) {
        const candidateNames = childChats
          .map((chat) => agentStore.getAgentById(chat.agentId || '')?.name || chat.title || '')
          .filter(Boolean)
        const uniqueNames = Array.from(new Set(candidateNames))
        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text:
                  `通信失败：主智能体存在多个可通信子会话，请明确传入 targetAgentName 以避免误投。\n` +
                  `可选目标: ${uniqueNames.join('、') || '（无）'}`
              }
            ]
          }
        }
      }

      const candidates = childChats.filter((chat) => {
        const name = agentStore.getAgentById(chat.agentId || '')?.name || chat.title || ''
        return !targetAgentName || name === targetAgentName
      })

      if (candidates.length === 0) {
        return {
          toolResult: {
            content: [
              { type: 'text', text: `通信失败：未找到名称为「${targetAgentName}」的子智能体会话。` }
            ]
          }
        }
      }

      const running = candidates.filter((chat) => chat.subTask?.status === 'running')
      const selected = [...(running.length > 0 ? running : candidates)].sort(
        (a, b) => b.createdAt - a.createdAt
      )[0]
      targetChatId = selected.id
      targetAgentLabel =
        agentStore.getAgentById(selected.agentId || '')?.name || selected.title || '子智能体'
    }

    if (!targetChatId) {
      return { toolResult: { content: [{ type: 'text', text: '通信失败：无法确定目标智能体。' }] } }
    }

    const targetChat = chatsStore.getChatById(targetChatId)
    if (!targetChat) {
      return {
        toolResult: { content: [{ type: 'text', text: '通信失败：目标智能体会话不存在。' }] }
      }
    }

    if (!isSubSender && targetChat.parentChatId !== senderChat.id) {
      return {
        toolResult: {
          content: [{ type: 'text', text: '通信失败：主智能体仅允许向当前会话的子会话发送消息。' }]
        }
      }
    }

    const isFinal = params.isFinal === true
    const success = params.success !== false
    const status: SubTaskStatus = isFinal ? (success ? 'completed' : 'failed') : 'running'

    const noticeText =
      `[智能体通信]\n` +
      `来自: ${senderAgentName}\n` +
      `状态: ${status}\n` +
      `消息: ${message}` +
      (isFinal && !success ? `\n错误: ${String(params.error || '未知错误')}` : '')

    chatsStore.addPendingMessage(targetChatId, [{ type: 'text', text: noticeText }])

    if (isSubSender && senderChat.subTask && isFinal) {
      chatsStore.updateSubTask(senderChat.id, {
        status,
        completedAt: Date.now(),
        result: message,
        error: success ? undefined : String(params.error || '子任务执行失败')
      })
    }

    if (!chatsStore.isChatGenerating(targetChatId)) {
      const queued = chatsStore.shiftPendingMessage(targetChatId)
      const parts = queued?.parts
      if (parts) {
        setTimeout(() => {
          useChat(targetChatId).sendMessages(parts)
        }, 0)
      }
    }

    return {
      toolResult: {
        content: [
          {
            type: 'text',
            text:
              `通信已发送并写入目标队列。\n` +
              `目标智能体: ${targetAgentLabel}\n` +
              `isFinal: ${isFinal}\n` +
              `status: ${status}`
          }
        ]
      }
    }
  }
})

export const getAgentBuiltinTools = (skills: SkillMetadata[]): Partial<Tools> => {
  const agentToolsWithoutCreator: Partial<Tools> = {
    delegate_to_sub_agent: {
      title: '分派子智能体任务',
      description: '主智能体将任务异步分派给子智能体执行，立即返回，不阻塞当前会话',
      inputSchema: z.object({
        task: z.string().describe('要分派给子智能体的任务内容'),
        agentName: z.string().optional().describe('子智能体名称，建议明确指定'),
        title: z.string().optional().describe('子会话标题'),
        switchToSubChat: z.boolean().optional().default(false).describe('是否切换到子会话')
      }),
      execute: async (args: unknown, options: { chatId: string }) => {
        const params = args as Record<string, any>
        const task = String(params.task || '').trim()
        if (!task) {
          return {
            toolResult: {
              content: [{ type: 'text', text: '分派失败：task 不能为空。' }]
            }
          }
        }

        const chatsStore = useChatsStores()
        const agentStore = useAgentStore()
        const parentChat = chatsStore.getChatById(options.chatId)
        if (!parentChat) {
          return {
            toolResult: {
              content: [{ type: 'text', text: '分派失败：未找到当前主会话。' }]
            }
          }
        }

        const requestedAgentName = String(params.agentName || '').trim()
        const availableAgents = agentStore.allAgents.filter(
          (agent) => agent.id !== parentChat.agentId
        )
        const targetAgent = requestedAgentName
          ? availableAgents.find((agent) => agent.name === requestedAgentName)
          : availableAgents[0]
        if (!targetAgent) {
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `分派失败：未找到名称为「${requestedAgentName}」的子智能体。`
                }
              ]
            }
          }
        }

        const { chatId: subChatId } = chatsStore.createSubChat({
          parentChatId: parentChat.id,
          task,
          agentId: targetAgent.id,
          title: params.title || `${targetAgent.name} · 子任务`,
          activate: !!params.switchToSubChat
        })

        const childPrompt =
          `你是子智能体，正在执行主智能体分配的任务。\n` +
          `主智能体: ${agentStore.getAgentById(parentChat.agentId || '')?.name || parentChat.title}\n\n` +
          `任务内容:\n${task}\n\n` +
          `要求：默认不要中途通信以节省 token。\n` +
          `仅在任务阻塞、需要主智能体决策、或发现高风险问题时，才调用 agent_communicate。\n` +
          `如需中途通信，请合并关键信息一次发送，避免频繁小消息。\n` +
          `任务结束时必须调用一次 agent_communicate 回传最终结果，并设置 isFinal=true。\n` +
          `成功请设置 success=true 并在 message 写最终结论；失败请设置 success=false 并填写 error。`

        setTimeout(() => {
          useChat(subChatId)
            .sendMessages(childPrompt)
            .catch((error) => {
              chatsStore.updateSubTask(subChatId, {
                status: 'failed',
                completedAt: Date.now(),
                error: (error as Error).message
              })
            })
        }, 0)

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text:
                  `子智能体任务已创建并开始异步执行。\n` +
                  `- 子智能体: ${targetAgent.name}\n` +
                  `- 子任务: ${params.title || `${targetAgent.name} · 子任务`}\n` +
                  `说明：任务执行不会阻塞当前主智能体，主子智能体统一使用 agent_communicate 通信。`
              }
            ]
          }
        }
      }
    },
    agent_communicate: createAgentCommunicateTool(),
    mcp_installer: {
      description: '自动添加MCP服务器配置到系统中，支持stdio、http和sse传输方式',
      inputSchema: z.object({
        name: z.string().describe('MCP服务器名称，必须是唯一的'),
        description: z.string().optional().describe('MCP服务器描述'),
        transport: z
          .enum(['stdio', 'http', 'sse'])
          .describe('传输方式：stdio(本地进程)、http(HTTP请求)或sse(服务端推送)'),
        command: z.string().optional().describe('命令(仅stdio传输)，例如：npx、python、node'),
        args: z.array(z.string()).optional().describe('命令参数列表(仅stdio传输)'),
        env: z.record(z.string(), z.string()).optional().describe('环境变量(仅stdio传输)'),
        url: z.string().optional().describe('服务器URL(http或sse传输)'),
        headers: z.record(z.string(), z.string()).optional().describe('请求头(http或sse传输)'),
        auto_activate: z.boolean().optional().describe('是否自动激活服务器，默认为true')
      }),
      title: 'MCP服务器安装器',
      execute: async (args: unknown) => {
        const params = args as Record<string, any>
        const {
          name,
          description,
          transport,
          command,
          args: cmdArgs,
          env,
          url,
          headers,
          auto_activate = true
        } = params
        if (!name) throw new Error('MCP服务器名称不能为空')
        if (!transport) throw new Error('必须指定传输方式(stdio、http或sse)')
        if (transport === 'stdio' && !command) throw new Error('stdio传输方式必须指定命令')
        if ((transport === 'http' || transport === 'sse') && !url)
          throw new Error('http或sse传输方式必须指定URL')

        try {
          const settingsStore = useSettingsStore()
          const currentServers = settingsStore.mcpServers || {}
          if (currentServers[name])
            throw new Error(`MCP服务器名称"${name}"已存在，请使用不同的名称`)

          const serverConfig: any = { name, transport, active: auto_activate, tools: [] }
          if (description) serverConfig.description = description
          if (transport === 'stdio') {
            serverConfig.command = command
            if (cmdArgs?.length > 0) serverConfig.args = cmdArgs
            if (env && Object.keys(env).length > 0) serverConfig.env = env
          } else {
            serverConfig.url = url
            if (headers && Object.keys(headers).length > 0) serverConfig.headers = headers
          }

          currentServers[name] = serverConfig
          settingsStore.mcpServers = currentServers

          let toolsInfo = ''
          if (auto_activate) {
            try {
              const tools = await chatService().list_tools({ [name]: serverConfig }, false)
              serverConfig.tools = tools
              settingsStore.mcpServers = currentServers
              toolsInfo = `\n已自动激活并获取到 ${Object.keys(tools).length} 个工具`
            } catch (error) {
              toolsInfo = `\n注意：服务器已添加但自动激活失败：${(error as Error).message}`
            }
          }

          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text:
                    `成功添加MCP服务器配置：\n` +
                    `- 名称: ${name}\n` +
                    `- 传输方式: ${transport}\n` +
                    `- 描述: ${description || '无'}\n` +
                    `- 自动激活: ${auto_activate ? '是' : '否'}\n` +
                    `${transport === 'stdio' ? `- 命令: ${command}${cmdArgs?.length > 0 ? ' ' + cmdArgs.join(' ') : ''}` : ''}\n` +
                    `${transport === 'http' || transport === 'sse' ? `- URL: ${url}` : ''}\n` +
                    toolsInfo
                }
              ]
            }
          }
        } catch (error) {
          return {
            toolResult: {
              content: [{ type: 'text', text: `添加MCP服务器失败: ${(error as Error).message}` }]
            }
          }
        }
      }
    },
    compress_context: {
      title: '压缩上下文',
      description:
        '当对话历史过长时，大模型调用此工具提交压缩后的上下文摘要。工具会保存压缩结果并在后续对话中使用。',
      inputSchema: z.object({
        compressed_summary: z
          .string()
          .describe(
            '压缩后的上下文摘要内容，由大模型生成，包含对话的关键信息、结论和需要记住的要点'
          )
      }),
      execute: async (
        args: unknown,
        options: { chatId: string; model: string; provider: string }
      ) => {
        const params = args as Record<string, any>
        const { compressed_summary } = params

        if (!compressed_summary || typeof compressed_summary !== 'string') {
          return { toolResult: { content: [{ type: 'text', text: '保存失败：压缩内容不能为空' }] } }
        }

        try {
          const { getChatById, updateMessages } = useChatsStores()
          const chat = getChatById(options.chatId)
          if (!chat) {
            return { toolResult: { content: [{ type: 'text', text: '保存失败：未找到当前对话' }] } }
          }

          const compressedMessage: BaseMessage = {
            id: nanoid(),
            role: 'system',
            parts: [
              {
                type: 'text',
                text: `[上下文已压缩] 以下是之前对话的关键信息摘要：\n${compressed_summary}`
              }
            ],
            metadata: {
              isCompressedContext: true,
              date: Date.now(),
              provider: options.provider,
              model: options.model,
              cid: options.chatId
            } as MetaData
          }

          updateMessages(options.chatId, (messages) => [...messages, compressedMessage])
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `上下文压缩已保存。压缩内容长度：${compressed_summary.length}字符。后续对话将基于压缩后的上下文进行。`
                }
              ]
            }
          }
        } catch (error) {
          return {
            toolResult: {
              content: [{ type: 'text', text: `保存压缩上下文失败: ${(error as Error).message}` }]
            }
          }
        }
      }
    },
    loadSkill: createLoadSkillTool(skills)
  }

  return {
    ...agentToolsWithoutCreator,
    agentCreator: {
      description: buildAgentCreatorDescription(skills, agentToolsWithoutCreator),
      inputSchema: z.object({
        name: z.string().describe('智能体名称，必须唯一。'),
        description: z.string().optional().describe('智能体的功能描述。'),
        systemPrompt: z.string().describe('智能体的系统提示词，定义其行为和角色。'),
        mcpServers: z
          .array(z.string())
          .optional()
          .describe(
            [
              '要启用的 MCP 服务器名称列表。',
              '可选值请严格从下列列表中选择：',
              formatResourceList(
                buildMcpServerReference().serverLines,
                '当前没有已配置的 MCP 服务器。'
              )
            ].join('\n')
          ),
        tools: z
          .array(z.string())
          .optional()
          .describe(
            [
              '要启用的 MCP 工具列表，格式必须为 `server.tool`，且 server 必须已包含在 mcpServers 中。',
              '可选值请严格从下列列表中选择：',
              formatResourceList(
                buildMcpServerReference().toolLines,
                '当前所配置的 MCP 服务器还没有加载出工具。'
              )
            ].join('\n')
          ),
        builtinTools: z
          .array(z.string())
          .optional()
          .describe(
            [
              '要启用的内置工具名称列表。',
              '可选值请严格从下列列表中选择：',
              buildBuiltinToolReference(skills, agentToolsWithoutCreator)
            ].join('\n')
          ),
        builtinToolsRequireApproval: z
          .array(z.string())
          .optional()
          .describe('需要在执行前手动批准的内置工具名称列表，必须是 builtinTools 的子集。'),
        knowledgeBaseIds: z
          .array(z.string())
          .optional()
          .describe(
            [
              '要关联的知识库 ID 列表。',
              '可选值请严格从下列列表中选择：',
              buildKnowledgeBaseReference()
            ].join('\n')
          ),
        ragEnabled: z
          .boolean()
          .optional()
          .describe('是否启用 RAG。只有在 knowledgeBaseIds 非空时才有意义。'),
        skills: z
          .array(z.string())
          .optional()
          .describe(
            [
              '要启用的技能名称列表。未传表示保持当前技能目录中的技能默认全部启用；传入后仅启用所列技能。',
              '可选值请严格从下列列表中选择：',
              buildSkillReference(skills)
            ].join('\n')
          ),
        skillDirectory: z
          .string()
          .optional()
          .describe('技能目录路径。未传时使用当前默认技能目录配置。'),
        icon: z.string().optional().describe('智能体图标或头像标识，可选。')
      }),
      title: '智能体创建器',
      execute: async (args: unknown) => {
        const params = (args || {}) as {
          name?: string
          description?: string
          systemPrompt?: string
          mcpServers?: unknown[]
          tools?: unknown[]
          builtinTools?: unknown[]
          builtinToolsRequireApproval?: unknown[]
          knowledgeBaseIds?: unknown[]
          ragEnabled?: boolean
          skills?: unknown[]
          skillDirectory?: string
          icon?: string
        }
        const {
          name,
          description,
          systemPrompt,
          mcpServers = [],
          tools = [],
          builtinTools = [],
          builtinToolsRequireApproval = [],
          knowledgeBaseIds = [],
          ragEnabled = false,
          skills: enabledSkills,
          skillDirectory,
          icon
        } = params
        if (!name) throw new Error('智能体名称不能为空')
        if (!systemPrompt) throw new Error('系统提示词不能为空')

        try {
          const agentStore = useAgentStore()
          const settingsStore = useSettingsStore()
          const knowledgeStore = useKnowledgeStore()
          const currentAgents = agentStore.agents || []
          if (currentAgents.some((agent) => agent.name === name)) {
            throw new Error(`智能体名称"${name}"已存在，请使用不同的名称`)
          }

          const selectedMcpServers = Array.isArray(mcpServers) ? mcpServers.map(String) : []
          const selectedMcpTools = Array.isArray(tools) ? tools.map(String) : []
          const selectedBuiltinTools = Array.isArray(builtinTools) ? builtinTools.map(String) : []
          const approvalBuiltinTools = Array.isArray(builtinToolsRequireApproval)
            ? builtinToolsRequireApproval.map(String)
            : []
          const selectedKnowledgeBaseIds = Array.isArray(knowledgeBaseIds)
            ? knowledgeBaseIds.map(String)
            : []
          const selectedEnabledSkills = Array.isArray(enabledSkills)
            ? enabledSkills.map(String)
            : undefined

          const availableBuiltinTools = new Set(Object.keys(getBuiltinTools({ skills })))
          const availableMcpServers = new Set(Object.keys(settingsStore.mcpServers || {}))
          const availableKnowledgeBases = new Set(
            (knowledgeStore.knowledgeBases || []).map((knowledgeBase) => knowledgeBase.id)
          )
          const availableSkills = new Set(skills.map((skill) => skill.name))

          const invalidMcpServers = selectedMcpServers.filter(
            (serverName) => !availableMcpServers.has(serverName)
          )
          if (invalidMcpServers.length > 0) {
            throw new Error(`以下 MCP 服务器不存在：${invalidMcpServers.join('、')}`)
          }

          const invalidBuiltinTools = selectedBuiltinTools.filter(
            (toolName) => !availableBuiltinTools.has(toolName)
          )
          if (invalidBuiltinTools.length > 0) {
            throw new Error(`以下内置工具不存在：${invalidBuiltinTools.join('、')}`)
          }

          const invalidApprovalTools = approvalBuiltinTools.filter(
            (toolName) => !selectedBuiltinTools.includes(toolName)
          )
          if (invalidApprovalTools.length > 0) {
            throw new Error(
              `以下需批准内置工具未在 builtinTools 中启用：${invalidApprovalTools.join('、')}`
            )
          }

          const invalidKnowledgeBases = selectedKnowledgeBaseIds.filter(
            (knowledgeBaseId) => !availableKnowledgeBases.has(knowledgeBaseId)
          )
          if (invalidKnowledgeBases.length > 0) {
            throw new Error(`以下知识库不存在：${invalidKnowledgeBases.join('、')}`)
          }

          const invalidSkills = (selectedEnabledSkills || []).filter(
            (skillName) => !availableSkills.has(skillName)
          )
          if (invalidSkills.length > 0) {
            throw new Error(`以下技能不存在：${invalidSkills.join('、')}`)
          }

          const invalidMcpTools = selectedMcpTools.filter((toolId) => {
            const [serverName, ...toolParts] = toolId.split('.')
            const toolName = toolParts.join('.')
            if (!serverName || !toolName) return true
            if (!selectedMcpServers.includes(serverName)) return true
            const server = settingsStore.mcpServers[serverName]
            return !(server?.tools && toolName in server.tools)
          })
          if (invalidMcpTools.length > 0) {
            throw new Error(
              `以下 MCP 工具无效、未加载，或不属于已选择的 MCP 服务器：${invalidMcpTools.join('、')}`
            )
          }

          const disabledSkills = selectedEnabledSkills
            ? skills
                .filter((skill) => !selectedEnabledSkills.includes(skill.name))
                .map((skill) => skill.name)
            : []

          const newAgent = {
            name,
            description: description || '',
            systemPrompt,
            mcpServers: selectedMcpServers,
            tools: selectedMcpTools,
            builtinTools: selectedBuiltinTools,
            builtinToolsRequireApproval: approvalBuiltinTools,
            knowledgeBaseIds: selectedKnowledgeBaseIds,
            ragEnabled: !!selectedKnowledgeBaseIds.length && !!ragEnabled,
            skillDirectory:
              typeof skillDirectory === 'string' && skillDirectory.trim()
                ? skillDirectory.trim()
                : undefined,
            disabledSkills,
            icon,
            execCommandRunInBackground: false
          }
          const agentId = agentStore.createAgent(
            newAgent as Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>
          )
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text:
                    `成功创建智能体：\n` +
                    `- 名称: ${name}\n` +
                    `- 描述: ${description || '无'}\n` +
                    `- 系统提示词: ${systemPrompt.substring(0, 100)}${systemPrompt.length > 100 ? '...' : ''}\n` +
                    `- MCP服务器: ${selectedMcpServers.length > 0 ? selectedMcpServers.join(', ') : '无'}\n` +
                    `- MCP工具: ${selectedMcpTools.length > 0 ? selectedMcpTools.join(', ') : '无'}\n` +
                    `- 内置工具: ${selectedBuiltinTools.length > 0 ? selectedBuiltinTools.join(', ') : '无'}\n` +
                    `- 需批准内置工具: ${approvalBuiltinTools.length > 0 ? approvalBuiltinTools.join(', ') : '无'}\n` +
                    `- 知识库: ${selectedKnowledgeBaseIds.length > 0 ? selectedKnowledgeBaseIds.join(', ') : '无'}\n` +
                    `- RAG: ${selectedKnowledgeBaseIds.length > 0 && ragEnabled ? '开启' : '关闭'}\n` +
                    `- 技能: ${selectedEnabledSkills && selectedEnabledSkills.length > 0 ? selectedEnabledSkills.join(', ') : '默认全部启用'}\n` +
                    `- 技能目录: ${typeof skillDirectory === 'string' && skillDirectory.trim() ? skillDirectory.trim() : '默认'}\n` +
                    `- 图标: ${icon || '默认'}\n` +
                    `- ID: ${agentId}\n`
                }
              ]
            }
          }
        } catch (error) {
          return {
            toolResult: {
              content: [{ type: 'text', text: `创建智能体失败: ${(error as Error).message}` }]
            }
          }
        }
      }
    }
  }
}
