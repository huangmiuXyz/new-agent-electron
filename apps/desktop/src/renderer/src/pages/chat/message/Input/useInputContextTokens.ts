import { computed, type ComputedRef } from 'vue'
import {
  estimateTextTokens,
  serializeMessageForTokenEstimation
} from '@renderer/services/chatService/tokenUsage'

const numberFormatter = new Intl.NumberFormat('zh-CN')
const COMPRESSED_CONTEXT_MARKER = '[上下文已压缩]'

// 单条消息 token 数缓存：key = `${messageId}:${model}:${serializedLength}`。
// 流式期间 messageSyncController 每 500ms 触发一次 store 变更，会让本 computed 重新求值。
// 不缓存时每次都会对全部上下文消息重新跑 tiktoken（WASM 字符级扫描），长对话下高频开销显著。
//
// key 纳入 serializedLength（序列化后文本长度）：同一 message.id 在流式输出、
// 编辑、工具结果补全时 parts 会变化，序列化长度随之变化，key 不同即可触发重新编码。
// 历史稳定消息长度不变 → 命中缓存；最后一条流式消息长度持续增长 → 每次重新编码。
// 序列化是纯字符串拼接（轻），tiktoken encode 是 WASM 字符级扫描（重），用轻量序列化
// 换掉重量 encode，收益保留，且不会返回过期的 token 数。
const MESSAGE_TOKEN_CACHE_LIMIT = 2000
const messageTokenCache = new Map<string, number>()

const estimateMessageTokensCached = (message: BaseMessage, model?: string): number => {
  const serialized = serializeMessageForTokenEstimation(message)
  if (!serialized) return 0

  const cacheKey = `${message.id}:${model || ''}:${serialized.length}`
  const cached = messageTokenCache.get(cacheKey)
  if (cached != null) return cached

  const tokens = estimateTextTokens(serialized, model) + 4
  // 简单容量保护：超过上限直接清空重建。token 数估算本身是幂等的，清空只会让
  // 下一轮重新编码一次，不会出错。比 LRU 实现更轻量，够用。
  if (messageTokenCache.size >= MESSAGE_TOKEN_CACHE_LIMIT) {
    messageTokenCache.clear()
  }
  messageTokenCache.set(cacheKey, tokens)
  return tokens
}

const estimateContextMessagesTokens = (messages: BaseMessage[], model?: string): number => {
  return messages.reduce((total, message) => total + estimateMessageTokensCached(message, model), 0)
}

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
    const messageTokens = estimateContextMessagesTokens(contextMessages, model)
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
