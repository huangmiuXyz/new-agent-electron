import { streamText as _streamText } from 'ai'
import { useChatsStores } from '@renderer/stores/chats'
import { useSettingsStore } from '@renderer/stores/settings'
import { nanoid } from '@renderer/utils/nanoid'
import { createRegistry } from './registry'
import { buildContextCompressionPrompt } from './systemPrompts'
import { estimateMessagesTokens, serializeMessageForTokenEstimation } from './tokenUsage'
import type { AutoCompressOptions } from './types'

type CompressionMetaData = MetaData & {
  compressedUpToIndex?: number
}

const COMPRESSED_CONTEXT_MARKER = '[上下文已压缩]'
const isCompressedContextMessage = (message: BaseMessage): boolean => {
  return Boolean(
    message.role === 'system' &&
    message.parts?.some(
      (part) => part.type === 'text' && part.text?.includes(COMPRESSED_CONTEXT_MARKER)
    )
  )
}

const isCompressingContextMessage = (message: BaseMessage): boolean => {
  return Boolean(
    (message.metadata as { isCompressingContext?: boolean } | undefined)?.isCompressingContext
  )
}

const serializeMessageForCompression = (message: BaseMessage): string => {
  return serializeMessageForTokenEstimation(message)
}

const getCompressionBoundaryTailMessages = (
  messages: BaseMessage[],
  compressedUpToIndex?: number
): BaseMessage[] => {
  const visibleMessages = messages.filter((message) => !isCompressingContextMessage(message))
  const baseMessages = visibleMessages.filter((message) => !isCompressedContextMessage(message))

  if (compressedUpToIndex == null || compressedUpToIndex < 0) {
    return baseMessages.filter((message) => message.role !== 'system')
  }

  if (compressedUpToIndex < baseMessages.length) {
    return baseMessages
      .slice(compressedUpToIndex + 1)
      .filter((message) => message.role !== 'system')
  }

  const latestCompressedMessageIndex = (() => {
    for (let i = visibleMessages.length - 1; i >= 0; i -= 1) {
      if (isCompressedContextMessage(visibleMessages[i])) {
        return i
      }
    }

    return -1
  })()

  if (latestCompressedMessageIndex === -1) {
    return []
  }

  return visibleMessages
    .slice(latestCompressedMessageIndex + 1)
    .filter((message) => message.role !== 'system' && !isCompressedContextMessage(message))
}

const normalizeCompressedMessages = (
  messages: BaseMessage[],
  compressedMessage: BaseMessage
): BaseMessage[] => {
  const baseMessages = messages.filter(
    (message) => !isCompressedContextMessage(message) && !isCompressingContextMessage(message)
  )
  return [...baseMessages, compressedMessage]
}

export const autoCompressContext = async (options: AutoCompressOptions): Promise<BaseMessage[]> => {
  const { cid, messages, contextCount, contextTokenCount, compressModel, activeModel } = options
  const { getChatById } = useChatsStores()
  const chat = getChatById(cid)
  const persistedMessages = chat?.messages ?? messages
  const persistedBaseMessages = persistedMessages.filter(
    (message) => !isCompressingContextMessage(message) && !isCompressedContextMessage(message)
  )
  const compressedContext = chat?.compressedContext
  const compressedBoundaryIndex = compressedContext?.compressedUpToIndex

  const hasPriorSummary = Boolean(compressedContext?.content)
  const unsummarizedTailMessages = getCompressionBoundaryTailMessages(
    persistedMessages,
    compressedBoundaryIndex
  )
  const messageThresholdReached = hasPriorSummary
    ? Boolean(contextCount && unsummarizedTailMessages.length > contextCount)
    : Boolean(contextCount && persistedBaseMessages.length > contextCount)
  const tokenThresholdReached = hasPriorSummary
    ? Boolean(
        contextTokenCount &&
        estimateMessagesTokens(unsummarizedTailMessages, activeModel) > contextTokenCount
      )
    : Boolean(
        contextTokenCount &&
        estimateMessagesTokens(persistedBaseMessages, activeModel) > contextTokenCount
      )

  const shouldAutoCompress =
    (messageThresholdReached || tokenThresholdReached) &&
    compressModel?.providerId &&
    compressModel?.modelId

  if (!shouldAutoCompress) return messages

  const compressProvider = useSettingsStore().getProviderById(compressModel.providerId)
  if (!compressProvider) return messages

  try {
    const meaningfulMessagesToCompress = hasPriorSummary
      ? unsummarizedTailMessages
      : persistedBaseMessages.filter((message) => {
          return message.role !== 'system' || Boolean(serializeMessageForCompression(message))
        })

    if (meaningfulMessagesToCompress.length === 0) return messages

    const lastCompressedIndex = (() => {
      for (let i = persistedBaseMessages.length - 1; i >= 0; i -= 1) {
        if (persistedBaseMessages[i].role !== 'system') {
          return i
        }
      }

      return undefined
    })()

    const compressedPrefix = compressedContext?.content?.trim()
    const newTailContext = meaningfulMessagesToCompress
      .map((message) => serializeMessageForCompression(message))
      .filter(Boolean)
      .join('\n\n')
    const contextToCompress = [compressedPrefix, newTailContext].filter(Boolean).join('\n\n')

    if (!contextToCompress) return messages

    const { updateMessages, updateMessage, updateMessageMetadata } = useChatsStores()

    const compressingMessageId = nanoid()
    const compressingMessage: BaseMessage = {
      id: compressingMessageId,
      role: 'system',
      parts: [
        {
          type: 'text',
          text: '🔃 正在压缩上下文...'
        }
      ],
      metadata: {
        isCompressingContext: true,
        date: Date.now(),
        provider: compressProvider.id,
        model: compressModel.modelId,
        stop: () => {},
        loading: true,
        cid,
        compressedUpToIndex: lastCompressedIndex
      } as CompressionMetaData
    }

    if (chat) {
      chat.compressedContext = {
        content: compressedContext?.content || '',
        compressedUpToIndex: compressedBoundaryIndex,
        updatedAt: Date.now(),
        provider: compressProvider.id,
        model: compressModel.modelId,
        loading: true
      }
      updateMessages(cid, (msgs) => normalizeCompressedMessages(msgs, compressingMessage))
    }

    let compressedText = ''

    const compressStream = _streamText({
      model: createRegistry({
        apiKey: compressProvider.apiKey || '',
        baseURL: compressProvider.baseUrl,
        name: compressProvider.name
      }).languageModel(`${compressProvider.providerType}:${compressModel.modelId}`),
      prompt: buildContextCompressionPrompt(contextToCompress),
      onFinish: ({ text }) => {
        compressedText = text
      }
    })

    let accumulatedText = ''
    try {
      for await (const data of compressStream.textStream) {
        accumulatedText += data
        if (chat) {
          updateMessage(cid, compressingMessageId, [
            {
              type: 'text',
              text: `🔃 正在压缩上下文...\n\n${accumulatedText}`
            }
          ])
        }
      }

      if (chat && compressedText) {
        chat.compressedContext = {
          content: compressedText,
          compressedUpToIndex: lastCompressedIndex,
          updatedAt: Date.now(),
          provider: compressProvider.id,
          model: compressModel.modelId,
          loading: false
        }
        updateMessage(cid, compressingMessageId, [
          {
            type: 'text',
            text: `${compressedText}\n\n${COMPRESSED_CONTEXT_MARKER}`
          }
        ])
      }

      if (chat) {
        const msg = chat.messages.find((m) => m.id === compressingMessageId)
        if (msg && msg.metadata) {
          const newMetadata = {
            ...msg.metadata,
            loading: false,
            ...(compressedText ? { isCompressedContext: true } : {})
          } as MetaData
          updateMessageMetadata(cid, compressingMessageId, newMetadata)
        }
      }
    } catch (streamError) {
      console.error('流式压缩出错:', streamError)
      if (chat) {
        chat.compressedContext = compressedContext
          ? { ...compressedContext, loading: false }
          : undefined
        updateMessage(cid, compressingMessageId, [
          {
            type: 'text',
            text: accumulatedText + '\n\n❌ 压缩过程出错，将使用原始上下文继续。'
          }
        ])
        const errorMsg = chat.messages.find((m) => m.id === compressingMessageId)
        if (errorMsg && errorMsg.metadata) {
          const newMetadata = { ...errorMsg.metadata, loading: false } as MetaData
          updateMessageMetadata(cid, compressingMessageId, newMetadata)
        }
      }
      return messages
    }

    if (compressedText && chat) {
      const compressingMsg = chat.messages.find((m) => m.id === compressingMessageId)
      if (compressingMsg) {
        return messages
      }
    }

    return messages
  } catch (error) {
    console.error('自动压缩上下文失败:', error)
    return messages
  }
}
