import type { LanguageModelMiddleware } from 'ai'

interface ContextLimitOptions {
  contextCount?: number
}

export const createContextLimitMiddleware = (options: ContextLimitOptions): LanguageModelMiddleware => {
  const { contextCount = 0 } = options

  return {
    specificationVersion: 'v4',
    transformParams: async ({ params }) => {
      const _t1 = createTimeLog('ContextLimit中间件')
      if (!contextCount || contextCount <= 0 || !Array.isArray(params.prompt)) {
        syncTimeLog(_t1, 'ContextLimit中间件')
        return params
      }

      const messages = params.prompt

      if (messages.length <= contextCount) {
        syncTimeLog(_t1, 'ContextLimit中间件')
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
        const firstNonTool = messages.findIndex(m => m.role !== 'tool')
        syncTimeLog(_t1, 'ContextLimit中间件')
        return {
          ...params,
          prompt: firstNonTool > 0 ? messages.slice(firstNonTool) : messages
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
        syncTimeLog(_t1, 'ContextLimit中间件')
        return {
          ...params,
          prompt: preservedMessages.slice(-contextCount)
        }
      }

      const tailMessages = messages.slice(lastCompressedIndex + 1)
      const truncatedTail = tailMessages.slice(-remainingSlots)
      const firstNonToolTail = truncatedTail.findIndex(m => m.role !== 'tool')
      const adjustedTail = firstNonToolTail > 0 ? truncatedTail.slice(firstNonToolTail) : truncatedTail

      const truncatedMessages = [...preservedMessages, ...adjustedTail]

      syncTimeLog(_t1, 'ContextLimit中间件')
      return {
        ...params,
        prompt: truncatedMessages
      }
    }
  }
}
