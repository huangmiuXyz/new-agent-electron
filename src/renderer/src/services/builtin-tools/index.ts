import { z } from 'zod'
export const builtinTools: Tools = {
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
        // 使用Function构造器安全地计算表达式
        // 只允许数学相关的函数和操作符
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

      // 验证传输方式对应的必需参数
      if (transport === 'stdio' && !command) {
        throw new Error('stdio传输方式必须指定命令')
      }

      if ((transport === 'http' || transport === 'sse') && !url) {
        throw new Error('http或sse传输方式必须指定URL')
      }

      try {
        // 获取当前设置存储
        const settingsStore = useSettingsStore()
        const currentServers = settingsStore.mcpServers || {}

        // 检查服务器名称是否已存在
        if (currentServers[name]) {
          throw new Error(`MCP服务器名称"${name}"已存在，请使用不同的名称`)
        }

        // 构建服务器配置
        const serverConfig: any = {
          name,
          transport,
          active: auto_activate,
          tools: []
        }

        // 添加可选字段
        if (description) serverConfig.description = description

        // 根据传输方式添加特定配置
        if (transport === 'stdio') {
          serverConfig.command = command
          if (cmdArgs && cmdArgs.length > 0) serverConfig.args = cmdArgs
          if (env && Object.keys(env).length > 0) serverConfig.env = env
        } else if (transport === 'http' || transport === 'sse') {
          serverConfig.url = url
          if (headers && Object.keys(headers).length > 0) serverConfig.headers = headers
        }

        // 添加服务器配置
        currentServers[name] = serverConfig
        settingsStore.mcpServers = currentServers

        // 如果需要自动激活，尝试获取工具列表
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

  suggestedReplies: {
    description: '生成对话界面中的推荐回复选项',
    inputSchema: z.object({
      title: z.string().describe('推荐回复的标题'),
      suggestions: z
        .array(
          z.object({
            id: z.string().describe('推荐回复的唯一标识符'),
            text: z.string().describe('推荐回复的文本内容'),
            action: z.string().optional().describe('推荐回复的动作描述')
          })
        )
        .describe('推荐回复列表，每个推荐回复包含ID、文本和可选的动作描述')
    }),
    title: '建议工具',
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const { title, suggestions } = params

      if (!title) {
        throw new Error('推荐回复标题不能为空')
      }

      if (!suggestions || !Array.isArray(suggestions) || suggestions.length === 0) {
        throw new Error('必须提供推荐回复一个建议')
      }

      // 验证每个建议的结构
      for (const suggestion of suggestions) {
        if (!suggestion.id || !suggestion.text) {
          throw new Error('推荐回复必须包含ID和文本内容')
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
  }
}

// 获取所有内置工具
export const getBuiltinTools = (): Tools => builtinTools
