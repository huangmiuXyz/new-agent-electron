import type { Ref } from 'vue'
import type { APICallError, FileUIPart, TextUIPart, ToolUIPart } from 'ai'
import {
  buildFlatTokenUsage,
  estimateMessageTokens,
  getFlatTokenUsage
} from '@renderer/services/chatService/tokenUsage'

const STREAM_SYNC_INTERVAL_MS = 80

type ChatMessageSyncControllerOptions = {
  chatId: string
  targetMessageId: Ref<string | undefined>
  getChatById: (chatId: string) => Chat | undefined | null
  updateMessages: (
    chatId: string,
    messages: BaseMessage[] | ((messages: BaseMessage[]) => BaseMessage[])
  ) => void
  markManuallyStopped: () => void
  onStreamingUpdate: (
    message: BaseMessage | undefined,
    newParts: (TextUIPart | ToolUIPart | FileUIPart)[] | undefined
  ) => void
}

const replaceMessageById = (
  messages: BaseMessage[],
  messageId: string,
  updater: (message: BaseMessage) => BaseMessage
) => {
  const messageIndex = messages.findIndex((message) => message.id === messageId)
  if (messageIndex < 0) return messages

  const nextMessages = [...messages]
  nextMessages[messageIndex] = updater(messages[messageIndex]!)
  return nextMessages
}

export const createChatMessageSyncController = ({
  chatId,
  targetMessageId,
  getChatById,
  updateMessages,
  markManuallyStopped,
  onStreamingUpdate
}: ChatMessageSyncControllerOptions) => {
  let streamFlushHandle: ReturnType<typeof setTimeout> | null = null
  let pendingStreamParts: (TextUIPart | ToolUIPart | FileUIPart)[] | undefined
  let pendingSpeechMessage: BaseMessage | undefined
  const pendingSyncMessageIds: string[] = []
  const pendingSyncMessages = new Map<string, BaseMessage>()

  const createStoreMessageSnapshot = (
    message?: BaseMessage,
    error?: APICallError
  ): BaseMessage | null => {
    if (!message) return null

    const nextParts = message.parts?.map((part) => ({ ...part }))
    const nextMetadata = {
      ...message.metadata,
      ...(error ? { error, loading: false } : {})
    } as MetaData

    if (nextMetadata.stop) {
      const originalStop = nextMetadata.stop
      nextMetadata.stop = (() => {
        markManuallyStopped()
        originalStop()
      }) as AbortController['abort']
    }

    const isFinalized = !nextMetadata.loading || !!error
    const flatUsage = getFlatTokenUsage(nextMetadata.usage)

    if (isFinalized) {
      const estimatedOutputTokens =
        flatUsage.outputTokens ?? estimateMessageTokens(message, nextMetadata.model)
      const estimatedInputTokens = flatUsage.inputTokens ?? nextMetadata.estimatedInputTokens
      const hasAnyUsage =
        flatUsage.totalTokens != null ||
        flatUsage.inputTokens != null ||
        flatUsage.outputTokens != null

      if (!hasAnyUsage || flatUsage.inputTokens == null || flatUsage.outputTokens == null) {
        nextMetadata.usage = buildFlatTokenUsage({
          inputTokens: estimatedInputTokens,
          outputTokens: estimatedOutputTokens,
          totalTokens: flatUsage.totalTokens,
          estimated: !hasAnyUsage
        }) as any
        nextMetadata.tokenUsageSource = hasAnyUsage ? 'mixed' : 'estimated'
      } else {
        nextMetadata.tokenUsageSource = 'reported'
      }
    }

    return {
      ...message,
      parts: nextParts,
      metadata: nextMetadata
    }
  }

  const syncMessageToStore = (message: BaseMessage | undefined) => {
    const msgToUpdate = createStoreMessageSnapshot(message)
    if (!msgToUpdate) return

    const storeChat = getChatById(chatId)
    if (!storeChat) return
    const oldMessages = storeChat.messages

    const existingIndex = oldMessages.findIndex((m) => m.id === msgToUpdate.id)
    if (existingIndex >= 0) {
      const existingMessage = oldMessages[existingIndex]
      if (existingMessage === msgToUpdate) return

      updateMessages(chatId, (messages) =>
        replaceMessageById(messages, msgToUpdate.id!, (message) => ({
          ...message,
          parts: msgToUpdate.parts,
          metadata: msgToUpdate.metadata
        }))
      )
      return
    }

    if (!targetMessageId.value) {
      updateMessages(chatId, [...oldMessages, msgToUpdate])
      return
    }

    const targetIndex = oldMessages.findIndex((m) => m.id === targetMessageId.value)
    if (targetIndex < 0) {
      updateMessages(chatId, [...oldMessages, msgToUpdate])
      return
    }

    const copy = [...oldMessages]
    const targetMsg = copy[targetIndex]

    if (targetMsg.role === 'assistant') {
      copy[targetIndex] = msgToUpdate
    } else {
      copy.splice(targetIndex + 1, 0, msgToUpdate)
    }

    updateMessages(chatId, copy)
  }

  const queueMessageSync = (message?: BaseMessage, error?: APICallError) => {
    const messageSnapshot = createStoreMessageSnapshot(message, error)
    if (!messageSnapshot) return

    if (!pendingSyncMessages.has(messageSnapshot.id)) {
      pendingSyncMessageIds.push(messageSnapshot.id)
    }
    pendingSyncMessages.set(messageSnapshot.id, messageSnapshot)
  }

  const flushStreamingUpdate = () => {
    if (streamFlushHandle) {
      clearTimeout(streamFlushHandle)
      streamFlushHandle = null
    }

    const messagesToSync = pendingSyncMessageIds
      .map((id) => pendingSyncMessages.get(id))
      .filter((message): message is BaseMessage => Boolean(message))

    pendingSyncMessageIds.length = 0
    pendingSyncMessages.clear()

    messagesToSync.forEach((message) => {
      syncMessageToStore(message)
    })

    onStreamingUpdate(pendingSpeechMessage, pendingStreamParts)
    pendingSpeechMessage = undefined
    pendingStreamParts = undefined
  }

  const finalizeMessageSync = (message?: BaseMessage, error?: APICallError) => {
    if (!message) {
      flushStreamingUpdate()
      return
    }

    message.metadata = {
      ...message.metadata,
      loading: false,
      ...(error ? { error } : {})
    } as MetaData

    queueMessageSync(message, error)
    flushStreamingUpdate()
  }

  const scheduleStreamingUpdate = (message?: BaseMessage) => {
    const messageSnapshot = createStoreMessageSnapshot(message)
    if (!messageSnapshot) return

    if (!pendingSyncMessages.has(messageSnapshot.id)) {
      pendingSyncMessageIds.push(messageSnapshot.id)
    }
    pendingSyncMessages.set(messageSnapshot.id, messageSnapshot)

    pendingStreamParts = messageSnapshot.parts as
      | (TextUIPart | ToolUIPart | FileUIPart)[]
      | undefined
    pendingSpeechMessage = messageSnapshot.role === 'assistant' ? messageSnapshot : undefined

    if (streamFlushHandle) return

    // Batch token-level updates so markdown parsing, Pinia persistence, and list patching
    // do not run on every tiny stream chunk.
    streamFlushHandle = setTimeout(() => {
      flushStreamingUpdate()
    }, STREAM_SYNC_INTERVAL_MS)
  }

  const dispose = () => {
    if (streamFlushHandle) {
      clearTimeout(streamFlushHandle)
      streamFlushHandle = null
    }
  }

  return {
    finalizeMessageSync,
    scheduleStreamingUpdate,
    dispose
  }
}
