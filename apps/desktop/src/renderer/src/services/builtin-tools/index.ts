import { z } from 'zod'

export const getBuiltinTools = (options?: { knowledgeBaseIds?: string[] }): Tools => {
  const { pluginLoader } = usePlugins()
  const manager = pluginLoader.getPluginManager()
  return ({
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
              content: [
                {
                  type: 'text',
                  text: `计算结果: ${result}\n表达式: ${expression}`
                }
              ]
            }
          }
        } catch (error) {
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `计算错误: ${(error as Error).message}\n表达式: ${expression}`
                }
              ]
            }
          }
        }
      }
    },

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

        if (!name) {
          throw new Error('MCP服务器名称不能为空')
        }

        if (!transport) {
          throw new Error('必须指定传输方式(stdio、http或sse)')
        }

        
        if (transport === 'stdio' && !command) {
          throw new Error('stdio传输方式必须指定命令')
        }

        if ((transport === 'http' || transport === 'sse') && !url) {
          throw new Error('http或sse传输方式必须指定URL')
        }

        try {
          
          const settingsStore = useSettingsStore()
          const currentServers = settingsStore.mcpServers || {}

          
          if (currentServers[name]) {
            throw new Error(`MCP服务器名称"${name}"已存在，请使用不同的名称`)
          }

          
          const serverConfig: any = {
            name,
            transport,
            active: auto_activate,
            tools: []
          }

          
          if (description) serverConfig.description = description

          
          if (transport === 'stdio') {
            serverConfig.command = command
            if (cmdArgs && cmdArgs.length > 0) serverConfig.args = cmdArgs
            if (env && Object.keys(env).length > 0) serverConfig.env = env
          } else if (transport === 'http' || transport === 'sse') {
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
                    `${transport === 'stdio' ? `- 命令: ${command}${cmdArgs && cmdArgs.length > 0 ? ' ' + cmdArgs.join(' ') : ''}` : ''}\n` +
                    `${transport === 'http' || transport === 'sse' ? `- URL: ${url}` : ''}\n` +
                    toolsInfo
                }
              ]
            }
          }
        } catch (error) {
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `添加MCP服务器失败: ${(error as Error).message}`
                }
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
          toolResult: {
            content: [
              {
                type: 'text',
                text: `<|stop|>`
              }
            ]
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

        if (!name) {
          throw new Error('智能体名称不能为空')
        }

        if (!systemPrompt) {
          throw new Error('系统提示词不能为空')
        }

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
              content: [
                {
                  type: 'text',
                  text: `创建智能体失败: ${(error as Error).message}`
                }
              ]
            }
          }
        }
      }
    },

    fetch: {
      title: '网络请求',
      description: 'fetch工具，可以获取网页内容或调用API',
      inputSchema: z.object({
        url: z.string().describe('要请求的URL'),
        method: z
          .enum(['GET', 'POST', 'PUT', 'DELETE'])
          .optional()
          .default('GET')
          .describe('请求方法'),
        headers: z.record(z.string(), z.string()).optional().describe('请求头'),
        body: z.string().optional().describe('请求体(POST/PUT时使用)')
      }),
      execute: async (args: any) => {
        const { url, method, headers, body } = args
        try {
          const response = await window.api.net.fetch(url, {
            method,
            headers,
            body
          })

          if (!response.ok) {
            return {
              toolResult: {
                content: [
                  {
                    type: 'text',
                    text: `请求失败: ${response.status} ${response.statusText}\n${response.error || response.text}`
                  }
                ]
              }
            }
          }

          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: response.text
                }
              ]
            }
          }
        } catch (error) {
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: `请求出错: ${(error as Error).message}`
                }
              ]
            }
          }
        }
      }
    },

    search_knowledge: {
      title: '知识库检索',
      description: `当用户的问题可能涉及文档、知识库或可查询的外部知识时：必须优先调用知识库查询工具进行检索，禁止使用“我不能回答 / 无法回答 / 当前不能”等拒绝性表述`,
      inputSchema: z.object({
        query: z.string().describe('The keyword or question to search for')
      }),
      execute: async (args: any) => {
        const { query } = args
        const { search } = useKnowledge()
        if (!options?.knowledgeBaseIds)
          return {
            toolResult: {
              content: [
                {
                  type: 'text',
                  text: '知识库检索失败：当前智能体未关联知识库'
                }
              ]
            }
          }
        let allResults: any[] = []
        for (const kbId of options.knowledgeBaseIds!) {
          try {
            const results = await search(query, kbId)
            allResults = allResults.concat(results)
          } catch (error) {
            console.error(`Error searching knowledge base ${kbId}:`, error)
          }
        }
        allResults.sort((a, b) => (b.score || 0) - (a.score || 0))
        const uniqueResults = allResults.filter(
          (result, index, self) => index === self.findIndex((r) => r.content === result.content)
        )

        return {
          toolResult: {
            content: [
              {
                type: 'text',
                text: uniqueResults.map((r) => r.content).join('\n\n')
              }
            ]
          }
        }
      }
    },
    exec_command: {
      title: '执行cmd命令',
      description: '执行cmd命令',
      inputSchema: z.object({
        command: z.string().describe('要执行的命令'),
        id: z.string().optional().describe('终端ID，默认创建新终端，创建新终端后才可以获得，用户无法提供')
      }),
      needsApproval: true,
      execute: async (args: any, options: any) => {
        const { command, id } = args
        const { createTab } = useTerminal()
        const { id: tabId, result } = await createTab({
          command,
          id,
          toolCallId: options.toolCallId,
          showTerminal: true
        })
        return {
          toolResult: {
            content: [
              {
                type: 'stdout',
                text: `终端ID: ${tabId}\n${result!.output}`
              }
            ]
          }
        }
      }
    },
    ...(manager?.getBuiltinTools ? Object.fromEntries(manager.getBuiltinTools()) : {})
  })
}
