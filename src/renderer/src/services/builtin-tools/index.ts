import { z } from 'zod'

export const builtinTools = {
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
  }
}

// 获取所有内置工具
export const getBuiltinTools = (): Tools => builtinTools
