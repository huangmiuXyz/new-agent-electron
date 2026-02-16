import { z } from 'zod'

export const getGeneralBuiltinTools = (): Partial<Tools> => ({
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
        toolResult: {
          content: [{ type: 'text', text: '<|stop|>' }]
        }
      }
    }
  },
  readFile: {
    title: '读取文件',
    description: '读取本地文件内容，适用于读取技能目录中的 references、scripts 配置或模板文件',
    inputSchema: z.object({
      path: z.string().describe('要读取的文件路径，建议传入绝对路径'),
      encoding: z.enum(['utf-8']).optional().default('utf-8').describe('文件编码，默认 utf-8')
    }),
    execute: async (args: unknown) => {
      const params = args as Record<string, any>
      const filePath = params.path as string

      if (!filePath) {
        return { toolResult: { content: [{ type: 'text', text: '读取文件失败：path 不能为空' }] } }
      }

      try {
        if (!window.api.fs.existsSync(filePath)) {
          return {
            toolResult: {
              content: [{ type: 'text', text: `读取文件失败：文件不存在 ${filePath}` }]
            }
          }
        }
        const stat = window.api.fs.lstatSync(filePath)
        const isDir = (stat.mode & 0o170000) === 0o040000
        if (isDir) {
          return {
            toolResult: {
              content: [{ type: 'text', text: `读取文件失败：目标是目录而非文件 ${filePath}` }]
            }
          }
        }
        const content = window.api.fs.readFileSync(filePath, 'utf-8')
        return { toolResult: { content: [{ type: 'text', text: content }] } }
      } catch (error) {
        return {
          toolResult: {
            content: [{ type: 'text', text: `读取文件失败: ${(error as Error).message}` }]
          }
        }
      }
    }
  },
  exec_command: {
    title: '执行cmd命令',
    description: '执行cmd命令',
    inputSchema: z.object({
      command: z.string().describe('要执行的命令'),
      id: z
        .string()
        .optional()
        .describe('终端ID，默认创建新终端，创建新终端后才可以获得，用户无法提供')
    }),
    needsApproval: true,
    execute: async (args: any, options: any) => {
      const { command, id } = args
      const { createTab } = useTerminal()
      const encodedCommand = btoa(String.fromCharCode(...new TextEncoder().encode(command)))
      const wrappedCommand = `cmd_file="/tmp/agentqi_$(date +%s)_$RANDOM" && echo "${encodedCommand}" | base64 -d > "$cmd_file" && bash "$cmd_file"; rm -f "$cmd_file"`

      const { id: tabId, result } = await createTab({
        command: wrappedCommand,
        id,
        toolCallId: options.toolCallId,
        showTerminal: true
      })
      return {
        toolResult: { content: [{ type: 'stdout', text: `终端ID: ${tabId}\n${result!.output}` }] }
      }
    }
  }
})
