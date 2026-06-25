import type { LanguageModelMiddleware } from 'ai'
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

const getCompressedContextFromStore = async (cid: string): Promise<string> => {
  const chatsStore = useChatsStores()
  const summary = chatsStore.chatSummaries.find((s) => s.id === cid)
  if (!summary?.compressedContext?.content || summary.compressedContext.loading) return ''
  return `${summary.compressedContext.content}\n\n${COMPRESSED_CONTEXT_MARKER}`
}

export const createCompressContextMiddleware = (
  options: CompressContextMiddlewareOptions
): LanguageModelMiddleware => {
  const { cid, contextCount } = options

  return {
    specificationVersion: 'v4',
    transformParams: async ({ params }) => {
      if (!Array.isArray(params.prompt)) {
        return params
      }

      const compressedContent = await getCompressedContextFromStore(cid)
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
      const slicedRecentMessages =
        recentMessageBudget > 0 ? recentMessages.slice(-recentMessageBudget) : []
      const firstNonTool = slicedRecentMessages.findIndex(m => m.role !== 'tool')
      const truncatedRecentMessages = firstNonTool > 0 ? slicedRecentMessages.slice(firstNonTool) : slicedRecentMessages

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
