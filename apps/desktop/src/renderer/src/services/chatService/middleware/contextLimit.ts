import type { LanguageModelV3Middleware } from '@ai-sdk/provider'

interface ContextLimitOptions {
  contextCount?: number
}

export const createContextLimitMiddleware = (options: ContextLimitOptions): LanguageModelV3Middleware => {
  const { contextCount = 10 } = options

  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      // 如果没有设置限制或 prompt 不是数组，直接返回
      if (!contextCount || contextCount <= 0 || !Array.isArray(params.prompt)) {
        return params
      }

      const messages = params.prompt

      // 如果消息数量小于等于限制，不需要截断
      if (messages.length <= contextCount) {
        return params
      }

      // 截取最近 contextCount 条消息
      const truncatedMessages = messages.slice(-contextCount)

      return {
        ...params,
        prompt: truncatedMessages
      }
    }
  }
}
