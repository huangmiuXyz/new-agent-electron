import { z } from 'zod'
import { createLoadSkillTool, type SkillMetadata } from '../../skillsService'
import { getBuiltinToolGroupEntries } from '../grouped-tools'
import { getBuiltinTools } from '..'

const MAX_RESOURCE_LINES = 40
const MAX_INHERITED_CONTEXT_MESSAGES = 30
const MAX_INHERITED_CONTEXT_CHARS = 12000

const getTextFromMessage = (message: BaseMessage): string => {
  return (
    message.parts
      ?.filter((part) => part.type === 'text')
      .map((part) => part.text?.trim())
      .filter(Boolean)
      .join('\n') || ''
  )
}

const getMessageRoleLabel = (role: BaseMessage['role']): string => {
  if (role === 'user') return '用户'
  if (role === 'assistant') return '主智能体'
  if (role === 'system') return '系统'
  return String(role)
}

const truncateText = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength)}\n...[已截断 ${text.length - maxLength} 字符]`
}

const buildInheritedParentContext = (chat: Chat): string => {
  const compressedContext = chat.compressedContext?.loading
    ? ''
    : chat.compressedContext?.content?.trim() || ''
  const serializedMessages = chat.messages
    .filter((message) => message.role !== 'system')
    .slice(-MAX_INHERITED_CONTEXT_MESSAGES)
    .map((message) => {
      const text = getTextFromMessage(message)
      if (!text) return ''
      return `${getMessageRoleLabel(message.role)}: ${text}`
    })
    .filter(Boolean)
    .join('\n\n')

  const context = [
    compressedContext ? `已压缩上下文:\n${compressedContext}` : '',
    serializedMessages ? `近期对话:\n${serializedMessages}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim()

  return truncateText(context, MAX_INHERITED_CONTEXT_CHARS)
}

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
  _skills: SkillMetadata[],
  agentToolsWithoutCreator: Partial<Tools>
): string => {
  const toolGroups = getBuiltinToolGroupEntries({ agentTools: agentToolsWithoutCreator })

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

const buildAvailableAgentsReference = (): string => {
  const agentStore = useAgentStore()
  const lines = (agentStore.allAgents || []).map((agent) => {
    const description = agent.description?.trim() || '无描述'
    return `- ${agent.name} | ${description}`
  })
  return formatResourceList(lines, '当前没有可用智能体。')
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

const submitSummaryToParent = (params: {
  chatId: string
  parentChatId: string
  summary: string
  success?: boolean
  error?: string
}) => {
  const { chatId, parentChatId, summary, success = true, error } = params
  const chatsStore = useChatsStores()
  const agentStore = useAgentStore()

  const runtimeChat = chatsStore.getChatById(chatId)
  const runtimeAgentId = runtimeChat?.agentId
  const runtimeAgent = runtimeAgentId ? agentStore.getAgentById(runtimeAgentId) : null
  const childAgentName =
    runtimeAgent?.name || runtimeChat?.title || '子智能体'
  const taskText = runtimeChat?.subTask?.task || runtimeChat?.title || ''

  const status: SubTaskStatus = success ? 'completed' : 'failed'

  chatsStore.updateSubTask(chatId, {
    status,
    completedAt: Date.now(),
    result: summary,
    error: success ? undefined : error || '子任务执行失败',
    subTaskResultSubmitted: true
  })

  const messageId = chatsStore.addPendingMessage(parentChatId, [
    {
      type: 'text',
      text:
        `[子智能体总结]\n` +
        `来自: ${childAgentName}\n` +
        `状态: ${status}\n` +
        `任务: ${taskText}\n` +
        `总结: ${summary}` +
        (!success && error ? `\n错误: ${error}` : '')
    }
  ])

  if (chatsStore.isChatGenerating(parentChatId)) {
    chatsStore.prioritizePendingMessage(parentChatId, messageId)
    chatsStore.markChatGuided(parentChatId)
  }
}

export const getAgentBuiltinTools = (skills: SkillMetadata[]): Partial<Tools> => {
  const agentToolsWithoutCreator: Partial<Tools> = {
    finish_sub_task: {
      title: '结束子任务',
      description:
        '子智能体在完成任务或遇到阻塞时调用此工具，向主智能体提交最终结果并结束任务。支持两种方式：直接返回最后一条回复内容，或自定义总结内容。',
      inputSchema: z.object({
        mode: z
          .enum(['last_message', 'custom'])
          .describe(
            '"last_message"：将当前最后一条回复作为结果返回给主智能体；"custom"：使用 message 字段自定义返回内容'
          ),
        message: z
          .string()
          .optional()
          .describe(
            '仅在 mode="custom" 时有效。面向主智能体的自定义返回内容，需包含结论、产物、关键事实或失败原因。'
          )
      }),
      execute: async (
        args: unknown,
        options: { chatId: string }
      ) => {
        const params = args as { mode: 'last_message' | 'custom'; message?: string }
        const chatsStore = useChatsStores()
        const runtimeChat = chatsStore.getChatById(options.chatId)

        if (!runtimeChat?.parentChatId || runtimeChat.subTask?.status !== 'running') {
          return {
            toolResult: {
              content: [
                { type: 'text', text: '仅子智能体在任务运行期间可调用此工具。' }
              ]
            }
          }
        }

        let summary = ''
        if (params.mode === 'last_message') {
          const lastAssistantMessage = [...runtimeChat.messages]
            .reverse()
            .find((msg) => msg.role === 'assistant')
          summary = lastAssistantMessage
            ? [...lastAssistantMessage.parts]
              .reverse()
              .find((part) => part.type === 'text')?.text!
            : ''
          if (!summary) {
            return {
              toolResult: {
                content: [
                  {
                    type: 'text',
                    text: '未找到可用的最后一条回复内容，请使用 "custom" 模式填写返回内容。'
                  }
                ]
              }
            }
          }
        } else {
          summary = (params.message || '').trim()
          if (!summary) {
            return {
              toolResult: {
                content: [
                  {
                    type: 'text',
                    text: 'mode="custom" 时，message 字段不能为空。'
                  }
                ]
              }
            }
          }
        }

        submitSummaryToParent({
          chatId: options.chatId,
          parentChatId: runtimeChat.parentChatId,
          summary
        })

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: '子任务结果已提交给主智能体，任务即将结束，请立即停止输出。'
              }
            ]
          }
        }
      }
    },
    delegate_to_sub_agent: {
      title: '分派子智能体任务',
      description: '主智能体将任务异步分派给子智能体执行，立即返回，不阻塞当前会话',
      inputSchema: z.object({
        task: z.string().describe('要分派给子智能体的任务内容'),
        agentName: z.string().optional().describe('子智能体名称，建议明确指定'),
        title: z.string().optional().describe('子会话标题'),
        inheritContext: z
          .boolean()
          .optional()
          .default(false)
          .describe(
            '是否继承主智能体会话上下文。开启后会把主会话的压缩上下文和近期文本对话作为参考上下文传给子智能体。'
          ),
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

        // 获取当前智能体的 allowedSubAgents 配置
        const parentAgent = agentStore.getAgentById(parentChat.agentId || '')
        const allowedSubAgents = parentAgent?.allowedSubAgents

        const requestedAgentName = String(params.agentName || '').trim()
        let availableAgents = agentStore.allAgents

        // 如果配置了 allowedSubAgents，则只允许调用列表中的智能体
        if (allowedSubAgents && allowedSubAgents.length > 0) {
          availableAgents = availableAgents.filter((agent) =>
            allowedSubAgents.includes(agent.name)
          )
        }

        const targetAgent = requestedAgentName
          ? availableAgents.find((agent) => agent.name === requestedAgentName)
          : availableAgents[0]
        if (!targetAgent) {
          const allowedList =
            allowedSubAgents && allowedSubAgents.length > 0
              ? `允许的子智能体: ${allowedSubAgents.join('、')}`
              : '当前没有可用智能体'
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `分派失败：未找到名称为「${requestedAgentName}」的子智能体。\n${allowedList}`
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

        const parentAgentName =
          agentStore.getAgentById(parentChat.agentId || '')?.name || parentChat.title
        const inheritedContext = params.inheritContext
          ? buildInheritedParentContext(parentChat)
          : ''
        const inheritedContextSection = inheritedContext
          ? `主会话参考上下文（仅供理解任务背景，仍以本次任务内容为准）:\n${inheritedContext}\n\n`
          : ''
        const childPrompt =
          `你是子智能体，正在执行主智能体分配的任务。\n` +
          `主智能体: ${parentAgentName}\n\n` +
          inheritedContextSection +
          `任务内容:\n${task}\n\n` +
          `要求：\n` +
          `1. 直接完成任务。\n` +
          `2. 完成任务后，必须调用 finish_sub_task 工具提交结果给主智能体：\n` +
          `   - mode="last_message"：以你最后一条回复作为返回内容\n` +
          `   - mode="custom" + message：撰写自定义的返回内容\n` +
          `3. 如遇到阻塞或失败，记录原因后调用 finish_sub_task 提交说明。`

        setTimeout(() => {
          useChat(subChatId)
            .sendMessages(childPrompt)
            .catch((error) => {
              const message = (error as Error).message || '子任务启动失败'
              submitSummaryToParent({
                chatId: subChatId,
                parentChatId: parentChat.id,
                summary: message,
                success: false,
                error: message
              })

              if (!chatsStore.isChatGenerating(parentChat.id)) {
                const pendingMessage = chatsStore.shiftPendingMessage(parentChat.id)
                if (pendingMessage) {
                  useChat(parentChat.id).sendMessages(pendingMessage.parts)
                }
              }
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
                  `- 继承主会话上下文: ${params.inheritContext ? '是' : '否'}\n` +
                  `说明：任务执行不会阻塞当前主智能体，子智能体完成后会通过 finish_sub_task 工具主动返回结果。`
              }
            ]
          }
        }
      }
    },
    mcp_installer: {
      description: '管理MCP服务器配置：添加(add)、删除(delete)或更新(update)服务器。添加/更新支持stdio、http和sse传输方式。',
      inputSchema: z.object({
        action: z
          .enum(['add', 'delete', 'update'])
          .optional()
          .default('add')
          .describe('操作类型：add(添加)、delete(删除)、update(更新现有服务器)'),
        name: z.string().describe('MCP服务器名称'),
        description: z.string().optional().describe('MCP服务器描述(仅add/update)'),
        transport: z
          .enum(['stdio', 'http', 'sse'])
          .optional()
          .describe('传输方式：stdio(本地进程)、http(HTTP请求)或sse(服务端推送)(仅add/update)'),
        command: z.string().optional().describe('命令(仅stdio传输)，例如：npx、python、node'),
        args: z.array(z.string()).optional().describe('命令参数列表(仅stdio传输)'),
        env: z.record(z.string(), z.string()).optional().describe('环境变量(仅stdio传输)'),
        url: z.string().optional().describe('服务器URL(http或sse传输)'),
        headers: z.record(z.string(), z.string()).optional().describe('请求头(http或sse传输)'),
        auto_activate: z.boolean().optional().describe('是否自动激活服务器，默认为true(仅add/update)')
      }),
      title: 'MCP服务器管理工具',
      execute: async (args: unknown) => {
        const params = args as Record<string, any>
        const {
          action = 'add',
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

        try {
          const settingsStore = useSettingsStore()
          const currentServers = settingsStore.mcpServers || {}

          // 删除操作
          if (action === 'delete') {
            if (!currentServers[name])
              throw new Error(`MCP服务器"${name}"不存在`)
            delete currentServers[name]
            settingsStore.mcpServers = currentServers
            return {
              toolResult: {
                content: [
                  {
                    type: 'text',
                    text: `成功删除MCP服务器配置：\n- 名称: ${name}`
                  }
                ]
              }
            }
          }

          // 更新操作
          if (action === 'update') {
            if (!currentServers[name])
              throw new Error(`MCP服务器"${name}"不存在，无法更新`)

            const existing = currentServers[name]
            const serverConfig: any = { ...existing }

            if (description !== undefined) serverConfig.description = description
            if (transport) serverConfig.transport = transport
            if (transport === 'stdio') {
              if (command) serverConfig.command = command
              if (cmdArgs !== undefined) serverConfig.args = cmdArgs
              if (env !== undefined) serverConfig.env = env
              delete serverConfig.url
              delete serverConfig.headers
            } else if (transport === 'http' || transport === 'sse') {
              if (url) serverConfig.url = url
              if (headers !== undefined) serverConfig.headers = headers
              delete serverConfig.command
              delete serverConfig.args
              delete serverConfig.env
            }
            serverConfig.active = auto_activate
            if (auto_activate) delete serverConfig.tools

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
                toolsInfo = `\n注意：服务器已更新但自动激活失败：${(error as Error).message}`
              }
            }

            return {
              toolResult: {
                content: [
                  {
                    type: 'text',
                    text:
                      `成功更新MCP服务器配置：\n` +
                      `- 名称: ${name}\n` +
                      `${toolsInfo}`
                  }
                ]
              }
            }
          }

          // 添加操作（原有逻辑）
          if (!transport) throw new Error('必须指定传输方式(stdio、http或sse)')
          if (transport === 'stdio' && !command) throw new Error('stdio传输方式必须指定命令')
          if ((transport === 'http' || transport === 'sse') && !url)
            throw new Error('http或sse传输方式必须指定URL')

          if (currentServers[name])
            throw new Error(`MCP服务器名称"${name}"已存在，请使用不同的名称或使用action="update"`)

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
          const actionLabel = action === 'delete' ? '删除' : action === 'update' ? '更新' : '添加'
          return {
            toolResult: {
              content: [{ type: 'text', text: `${actionLabel}MCP服务器失败: ${(error as Error).message}` }]
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
        icon: z.string().optional().describe('智能体图标或头像标识，可选。'),
        allowedSubAgents: z
          .array(z.string())
          .optional()
          .describe(
            [
              '允许该智能体调用的子智能体名称列表。留空表示允许调用所有智能体。',
              '可选值请严格从下列列表中选择：',
              buildAvailableAgentsReference()
            ].join('\n')
          )
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
          allowedSubAgents?: unknown[]
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
          icon,
          allowedSubAgents: rawAllowedSubAgents
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

          const selectedAllowedSubAgents = Array.isArray(rawAllowedSubAgents)
            ? rawAllowedSubAgents.map(String)
            : []

          const allAgentNames = agentStore.allAgents.map((agent) => agent.name)
          const invalidAllowedSubAgents = selectedAllowedSubAgents.filter(
            (agentName) => !allAgentNames.includes(agentName)
          )
          if (invalidAllowedSubAgents.length > 0) {
            throw new Error(`以下子智能体不存在：${invalidAllowedSubAgents.join('、')}`)
          }

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
            execCommandRunInBackground: false,
            allowedSubAgents: selectedAllowedSubAgents.length > 0 ? selectedAllowedSubAgents : undefined
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
                    `- 允许调用的子智能体: ${selectedAllowedSubAgents.length > 0 ? selectedAllowedSubAgents.join(', ') : '所有智能体'}\n` +
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
