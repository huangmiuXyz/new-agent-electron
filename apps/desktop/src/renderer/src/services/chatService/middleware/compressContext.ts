import type { LanguageModelV3Middleware } from '@ai-sdk/provider'
import { useChatsStores } from '@renderer/stores/chats'

interface CompressContextMiddlewareOptions {
  cid: string
  contextCount?: number
}

const COMPRESSED_CONTEXT_MARKER = '[上下文已压缩]'

const getLatestCompressedContextIndex = (messages: Array<{ role: string; content?: unknown }>): number => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg.role !== 'system' || typeof msg.content !== 'string') continue
    if (msg.content.includes(COMPRESSED_CONTEXT_MARKER)) {
      return i
    }
  }

  return -1
}

const getCompressedContextFromStore = (cid: string): string => {
  const chat = useChatsStores().getChatById(cid)
  if (!chat?.compressedContext?.content || chat.compressedContext.loading) return ''
  return `${chat.compressedContext.content}\n\n${COMPRESSED_CONTEXT_MARKER}`
}

export const createCompressContextMiddleware = (
  options: CompressContextMiddlewareOptions
): LanguageModelV3Middleware => {
  const { cid, contextCount } = options

  return {
    specificationVersion: 'v3',
    transformParams: async ({ params }) => {
      if (!Array.isArray(params.prompt)) {
        return params
      }

      const compressedContent = getCompressedContextFromStore(cid)
      if (!compressedContent) {
        return params
      }

      const messages = params.prompt
      const compressedIndex = getLatestCompressedContextIndex(messages)
      const preservedSystemPrompts = messages.filter((msg, index) => {
        if (compressedIndex !== -1 && index >= compressedIndex) return false
        if (msg.role !== 'system') return false
        const content = typeof msg.content === 'string' ? msg.content : ''
        return !content.includes(COMPRESSED_CONTEXT_MARKER)
      })
      const recentMessages = messages
        .slice(compressedIndex + 1)
        .filter((msg) => msg.role !== 'system')
      const recentMessageBudget =
        contextCount && contextCount > 0
          ? Math.max(contextCount - preservedSystemPrompts.length - 1, 0)
          : recentMessages.length
      const truncatedRecentMessages =
        recentMessageBudget > 0 ? recentMessages.slice(-recentMessageBudget) : []

      return {
        ...params,
        prompt: [
          ...preservedSystemPrompts,
          {
            role: 'system' as const,
            content: compressedContent
          },
          ...truncatedRecentMessages
        ]
      }
    }
  }
}
