import type { LanguageModelV3Middleware } from '@ai-sdk/provider'

export const createCompressContextMiddleware = (): LanguageModelV3Middleware => {
  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      if (!Array.isArray(params.prompt)) {
        return params
      }

      const messages = params.prompt

      let lastCompressedIndex = -1
      let lastCompressedContent = ''

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i]
        if (msg.role !== 'system' || !msg.content) continue

        const content = typeof msg.content === 'string' ? msg.content : ''
        if (content.includes('[上下文已压缩]')) {
          lastCompressedIndex = i
          lastCompressedContent = content
        }
      }

      if (lastCompressedIndex === -1) {
        return params
      }

      const preservedSystemPrompts = messages.filter((msg, index) => {
        if (index >= lastCompressedIndex) return false
        if (msg.role !== 'system') return false
        const content = typeof msg.content === 'string' ? msg.content : ''
        return !content.includes('[上下文已压缩]')
      })

      const compressedMessage = {
        role: 'system' as const,
        content: lastCompressedContent
      }

      const recentMessages = messages.slice(lastCompressedIndex + 1)

      return {
        ...params,
        prompt: [...preservedSystemPrompts, compressedMessage, ...recentMessages]
      }
    }
  }
}
