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

export async function buildContextMessages(
  chatId: string,
  options: { contextCount?: number; contextTokenCount?: number; model?: string }
): Promise<BaseMessage[]> {
  const { contextCount } = options
  const allMessages = await chatRepository.loadAllMessages(chatId)
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
  agent: { contextCount?: number; contextTokenCount?: number; systemPrompt?: string } | null | undefined
): Promise<BaseMessage[]> {
  const contextMessages = await buildContextMessages(chatId, {
    contextCount: agent?.contextCount,
    contextTokenCount: agent?.contextTokenCount
  })

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
