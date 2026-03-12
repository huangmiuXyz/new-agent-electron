import type { LanguageModelV3Middleware } from '@ai-sdk/provider'

interface ContextLimitOptions {
  contextCount?: number
}

export const createContextLimitMiddleware = (options: ContextLimitOptions): LanguageModelV3Middleware => {
  const { contextCount = 10 } = options

  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      if (!contextCount || contextCount <= 0 || !Array.isArray(params.prompt)) {
        return params
      }

      const messages = params.prompt

      if (messages.length <= contextCount) {
        return params
      }

      let lastCompressedIndex = -1
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]
        if (msg.role !== 'system' || typeof msg.content !== 'string') continue
        if (msg.content.includes('[上下文已压缩]')) {
          lastCompressedIndex = i
        }
      }

      if (lastCompressedIndex === -1) {
        return {
          ...params,
          prompt: messages.slice(-contextCount)
        }
      }

      const maxSystemCount = Math.max(contextCount - 1, 0)
      const preservedSystems = messages
        .filter((msg, index) => {
          if (index >= lastCompressedIndex) return false
          return msg.role === 'system' && typeof msg.content === 'string' && !msg.content.includes('[上下文已压缩]')
        })
        .slice(-maxSystemCount)

      const preservedMessages = [...preservedSystems, messages[lastCompressedIndex]]

      const remainingSlots = contextCount - preservedMessages.length
      if (remainingSlots <= 0) {
        return {
          ...params,
          prompt: preservedMessages.slice(-contextCount)
        }
      }

      const tailMessages = messages.slice(lastCompressedIndex + 1)
      const truncatedTail = tailMessages.slice(-remainingSlots)

      const truncatedMessages = [...preservedMessages, ...truncatedTail]

      return {
        ...params,
        prompt: truncatedMessages
      }
    }
  }
}
