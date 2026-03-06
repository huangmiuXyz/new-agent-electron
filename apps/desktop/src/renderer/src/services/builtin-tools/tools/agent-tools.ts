import { z } from 'zod'
import { createLoadSkillTool, type SkillMetadata } from '../../skillsService'

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
    success: z.boolean().optional().default(true).describe('最终结论是否成功（isFinal=true 时生效）'),
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
        return { toolResult: { content: [{ type: 'text', text: '通信失败：当前主会话没有可通信的子智能体。' }] } }
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
            content: [{ type: 'text', text: `通信失败：未找到名称为「${targetAgentName}」的子智能体会话。` }]
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
      return { toolResult: { content: [{ type: 'text', text: '通信失败：目标智能体会话不存在。' }] } }
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

export const getAgentBuiltinTools = (skills: SkillMetadata[]): Partial<Tools> => ({
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
      const availableAgents = agentStore.allAgents.filter((agent) => agent.id !== parentChat.agentId)
      const targetAgent = requestedAgentName
        ? availableAgents.find((agent) => agent.name === requestedAgentName)
        : availableAgents[0]
      if (!targetAgent) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `分派失败：未找到名称为「${requestedAgentName}」的子智能体。` }]
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
        useChat(subChatId).sendMessages(childPrompt).catch((error) => {
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
        if (currentServers[name]) throw new Error(`MCP服务器名称"${name}"已存在，请使用不同的名称`)

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
  agentCreator: {
    description: '创建一个新的智能体，可以配置名称、描述、系统提示词、MCP服务器、工具等',
    inputSchema: z.object({
      name: z.string().describe('智能体名称，必须是唯一的'),
      description: z.string().optional().describe('智能体的功能描述'),
      systemPrompt: z.string().describe('智能体的系统提示词，定义其行为和角色')
    }),
    title: '智能体创建器',
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const {
        name,
        description,
        systemPrompt,
        mcpServers = [],
        tools = [],
        builtinTools = [],
        icon
      } = params
      if (!name) throw new Error('智能体名称不能为空')
      if (!systemPrompt) throw new Error('系统提示词不能为空')

      try {
        const agentStore = useAgentStore()
        const currentAgents = agentStore.agents || []
        if (currentAgents.some((agent) => agent.name === name)) {
          throw new Error(`智能体名称"${name}"已存在，请使用不同的名称`)
        }

        const now = Date.now()
        const newAgent = {
          id: nanoid(),
          name,
          description: description || '',
          systemPrompt,
          mcpServers,
          tools,
          builtinTools,
          icon,
          createdAt: now,
          updatedAt: now
        }
        agentStore.createAgent(newAgent)
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
                  `- MCP服务器: ${mcpServers.length > 0 ? mcpServers.join(', ') : '无'}\n` +
                  `- MCP工具: ${tools.length > 0 ? tools.join(', ') : '无'}\n` +
                  `- 内置工具: ${builtinTools.length > 0 ? builtinTools.join(', ') : '无'}\n` +
                  `- 图标: ${icon || '默认'}\n` +
                  `- ID: ${newAgent.id}\n`
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
  },
  compress_context: {
    title: '压缩上下文',
    description:
      '当对话历史过长时，大模型调用此工具提交压缩后的上下文摘要。工具会保存压缩结果并在后续对话中使用。',
    inputSchema: z.object({
      compressed_summary: z
        .string()
        .describe('压缩后的上下文摘要内容，由大模型生成，包含对话的关键信息、结论和需要记住的要点')
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
})
