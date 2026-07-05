import { chatRepository } from './chatRepository'
import { estimateMessagesTokens } from '@renderer/services/chatService/tokenUsage'

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

/**
 * 构建发送给 AI 的上下文消息列表。
 *
 * @param preloadedMessages - 可选，已加载的消息快照。传此参数可避免从 SQLite 全量加载，
 *   大幅减少内存分配。调用者应从 messageWindows（store 中已有的消息窗口）传入。
 *   注意：如果聊天存在压缩上下文（compressed context），preloadedMessages 可能不包含
 *   早期的 system 消息，此时会自动回退到 loadAllMessages。
 */
export async function buildContextMessages(
  chatId: string,
  options: { contextCount?: number; contextTokenCount?: number; model?: string },
  preloadedMessages?: BaseMessage[]
): Promise<BaseMessage[]> {
  const { contextCount } = options

  // 优先使用预加载消息，避免每次发送时从 SQLite 全量加载全部历史
  let allMessages: BaseMessage[]
  if (preloadedMessages) {
    // 检查预加载消息是否足够覆盖上下文需求：
    // - 如果有限制 contextCount，且预加载消息数 >= contextCount，直接用
    // - 如果有压缩上下文场景，需要找到 system 消息，若预加载中找不到则回退
    const hasContextLimit = contextCount && contextCount > 0
    const hasCompressedInPreloaded = preloadedMessages.some((msg) => isCompressedContextMessage(msg))

    if (hasCompressedInPreloaded || !hasContextLimit || preloadedMessages.length >= contextCount) {
      allMessages = preloadedMessages
    } else {
      // 预加载消息不够 contextCount，从 DB 补充加载
      const loadLimit = Math.max(contextCount * 2, 100)
      const window = await chatRepository.loadRecentMessages(chatId, loadLimit)
      allMessages = window.messages
    }
  } else {
    // 无预加载数据时，按需加载：有限制则只加载最近的倍数，避免全量加载
    if (contextCount && contextCount > 0) {
      const loadLimit = Math.max(contextCount * 2, 100)
      const window = await chatRepository.loadRecentMessages(chatId, loadLimit)
      allMessages = window.messages
    } else {
      allMessages = await chatRepository.loadAllMessages(chatId)
    }
  }

  const messages = allMessages.filter((msg) => !isCompressingContextMessage(msg))
  const compressedContextMsg = messages.find((msg) => isCompressedContextMessage(msg))

  if (compressedContextMsg && !compressedContextMsg.metadata?.loading) {
    const baseMessages = messages.filter((msg) => !isCompressedContextMessage(msg))
    const systemMessages = baseMessages.filter((msg) => msg.role === 'system')
    const compressedMsgIndex = messages.indexOf(compressedContextMsg)
    const tailMessages = messages
      .slice(compressedMsgIndex + 1)
      .filter((msg) => msg.role !== 'system' && !isCompressedContextMessage(msg))
    const recentMessageBudget =
      contextCount && contextCount > 0
        ? Math.max(contextCount - systemMessages.length - 1, 0)
        : tailMessages.length
    const recentMessages = recentMessageBudget > 0 ? tailMessages.slice(-recentMessageBudget) : []
    return [...systemMessages, compressedContextMsg, ...recentMessages]
  }

  if (contextCount && contextCount > 0 && messages.length > contextCount) {
    return messages.slice(-contextCount)
  }
  return messages
}

export function estimateContextTokenCount(messages: BaseMessage[], model?: string): number {
  return estimateMessagesTokens(messages, model)
}

export async function getMessagesForModel(
  chatId: string,
  agent: { contextCount?: number; contextTokenCount?: number; systemPrompt?: string } | null | undefined,
  preloadedMessages?: BaseMessage[]
): Promise<BaseMessage[]> {
  const contextMessages = await buildContextMessages(chatId, {
    contextCount: agent?.contextCount,
    contextTokenCount: agent?.contextTokenCount
  }, preloadedMessages)

  if (agent?.systemPrompt) {
    const systemMessage: BaseMessage = {
      id: 'system-prompt',
      role: 'system',
      parts: [{ type: 'text', text: agent.systemPrompt }]
    }
    return [systemMessage, ...contextMessages]
  }

  return contextMessages
}
