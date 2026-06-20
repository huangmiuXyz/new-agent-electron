import { z } from 'zod'
import TodoWriteRender from '../components/todo/TodoWriteRender.vue'

const todoItemSchema = z.object({
  content: z.string().describe('任务的简短描述'),
  status: z
    .enum(['pending', 'in_progress', 'completed', 'cancelled'])
    .optional()
    .default('pending')
    .describe('状态: pending=未开始, in_progress=进行中, completed=已完成, cancelled=已取消'),
  priority: z
    .enum(['high', 'medium', 'low'])
    .optional()
    .default('medium')
    .describe('优先级: high=高, medium=中, low=低')
})

export const getTodoBuiltinTools = (): Partial<Tools> => ({
  todowrite: {
    title: '任务清单管理',
    description: [
      '为当前编码会话创建并维护一个结构化的任务列表。跟踪进度、组织多步骤工作，并向用户展示状态。',
      '',
      '用法：',
      '- 首次调用传入完整任务列表，所有 status 默认为 pending',
      '- 后续调用传入完整当前状态（包含已更新的 status），不要增量更新',
      '- 任务完成时标记为 completed，不再需要的标记为 cancelled',
      '- 保持列表精简，已完成的任务可以从列表中移除'
    ].join('\n'),
    render: TodoWriteRender,
    renderSummary: (args: unknown) => {
      const todos = (args as Record<string, any>)?.todos as any[] | undefined
      if (!Array.isArray(todos) || todos.length === 0) return '📋 任务清单（空）'
      const total = todos.length
      const completed = todos.filter((t) => t?.status === 'completed').length
      const inProgress = todos.filter((t) => t?.status === 'in_progress').length
      const parts = [`${completed}/${total}`]
      if (inProgress > 0) parts.push(`${inProgress} 进行中`)
      return `📋 任务清单 (${parts.join(', ')})`
    },
    inputSchema: z.object({
      todos: z
        .array(todoItemSchema)
        .describe('完整任务列表。AI 自身维护状态，每次调用传入完整列表而非增量。')
    }),
    execute: async (args: unknown) => {
      const todos = Array.isArray((args as Record<string, any>)?.todos) ? (args as Record<string, any>).todos : []
      const total = todos.length
      const pending = todos.filter((t: any) => t?.status === 'pending').length
      const inProgress = todos.filter((t: any) => t?.status === 'in_progress').length
      const completed = todos.filter((t: any) => t?.status === 'completed').length
      const cancelled = todos.filter((t: any) => t?.status === 'cancelled').length

      const lines = [
        `任务列表已更新 (共 ${total} 项)`,
        `- pending (未开始): ${pending}`,
        `- in_progress (进行中): ${inProgress}`,
        `- completed (已完成): ${completed}`,
        `- cancelled (已取消): ${cancelled}`,
        '',
        total > 0 ? `进度: ${completed}/${total} (${Math.round((completed / total) * 100)}%)` : ''
      ]
      if (inProgress > 0) lines.push(`当前进行中: ${inProgress} 项`)
      if (completed === total && total > 0) lines.push('所有任务已完成！')

      return {
        toolResult: {
          content: [{ type: 'text', text: lines.filter(Boolean).join('\n') }]
        }
      }
    }
  }
})
