import { computed, type ComputedRef } from 'vue'
import {
  estimateMessagesTokens,
  estimateTextTokens
} from '@renderer/services/chatService/tokenUsage'

const numberFormatter = new Intl.NumberFormat('zh-CN')
const COMPRESSED_CONTEXT_MARKER = '[上下文已压缩]'

const isCompressedContextMessage = (message: BaseMessage): boolean => {
  return Boolean(
    message.metadata?.isCompressedContext ||
      message.parts?.some(
        (part) => part.type === 'text' && part.text?.includes(COMPRESSED_CONTEXT_MARKER)
      )
  )
}

const isCompressingContextMessage = (message: BaseMessage): boolean => {
  return Boolean(message.metadata?.isCompressingContext)
}

const estimateSystemTextTokens = (text: string, model?: string): number => {
  const trimmed = text.trim()
  if (!trimmed) return 0
  return estimateTextTokens(`system: ${trimmed}`, model) + 4
}

const formatTokenCount = (value: number): string => {
  if (value >= 1000) {
    const compactValue = value / 1000
    return `${compactValue >= 10 ? compactValue.toFixed(0) : compactValue.toFixed(1)}k`
  }

  return numberFormatter.format(value)
}

const getCurrentContextMessages = (chat: Chat, agent?: Agent | null): BaseMessage[] => {
  const contextCount = agent?.contextCount ?? 0
  const messages = chat.messages.filter((message) => !isCompressingContextMessage(message))
  const compressedContext = chat.compressedContext

  if (compressedContext?.content && !compressedContext.loading) {
    const baseMessages = messages.filter((message) => !isCompressedContextMessage(message))
    const preservedSystemMessages = baseMessages.filter((message) => message.role === 'system')
    const compressedUpToIndex = compressedContext.compressedUpToIndex
    const tailMessages =
      compressedUpToIndex == null || compressedUpToIndex < 0
        ? baseMessages.filter((message) => message.role !== 'system')
        : baseMessages
            .slice(compressedUpToIndex + 1)
            .filter((message) => message.role !== 'system')
    const recentMessageBudget =
      contextCount > 0
        ? Math.max(contextCount - preservedSystemMessages.length - 1, 0)
        : tailMessages.length
    const recentMessages =
      recentMessageBudget > 0 ? tailMessages.slice(-recentMessageBudget) : []

    return [...preservedSystemMessages, ...recentMessages]
  }

  if (contextCount > 0 && messages.length > contextCount) {
    return messages.slice(-contextCount)
  }

  return messages
}

export const useInputContextTokens = (options: {
  chat: ComputedRef<Chat | null | undefined>
  agent: ComputedRef<Agent | null | undefined>
  modelId: ComputedRef<string>
}) => {
  return computed(() => {
    const chat = options.chat.value
    const model = options.modelId.value
    const agent = options.agent.value

    if (!chat) {
      return {
        total: 0,
        contextMessageCount: 0,
        hasContext: false,
        totalDisplay: formatTokenCount(0),
        contextMessageCountDisplay: numberFormatter.format(0),
        tooltip: '当前上下文 Token\n暂无可用统计'
      }
    }

    const contextMessages = getCurrentContextMessages(chat, agent)
    const messageTokens = estimateMessagesTokens(contextMessages, model)
    const compressedContextTokens =
      chat.compressedContext?.content && !chat.compressedContext.loading
        ? estimateSystemTextTokens(
            `${chat.compressedContext.content}\n\n${COMPRESSED_CONTEXT_MARKER}`,
            model
          )
        : 0
    const systemTokens = estimateSystemTextTokens(agent?.systemPrompt || '', model)
    const total = messageTokens + compressedContextTokens + systemTokens

    return {
      total,
      contextMessageCount: contextMessages.length,
      hasContext: total > 0 || contextMessages.length > 0,
      totalDisplay: formatTokenCount(total),
      contextMessageCountDisplay: numberFormatter.format(contextMessages.length),
      tooltip:
        total > 0 || contextMessages.length > 0
          ? [
              '当前上下文 Token（估算）',
              `总计: ${formatTokenCount(total)}`,
              `上下文消息: ${numberFormatter.format(contextMessages.length)} 条`
            ].join('\n')
          : '当前上下文 Token\n暂无可用统计'
    }
  })
}
