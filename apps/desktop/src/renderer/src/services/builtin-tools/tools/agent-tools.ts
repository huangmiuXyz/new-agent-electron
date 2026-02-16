import { z } from 'zod'
import { createLoadSkillTool, type SkillMetadata } from '../../skillsService'

export const getAgentBuiltinTools = (skills: SkillMetadata[]): Partial<Tools> => ({
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
