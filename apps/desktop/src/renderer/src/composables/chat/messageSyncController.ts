import type { Ref } from 'vue'
import type { APICallError, FileUIPart, TextUIPart, ToolUIPart } from 'ai'
import {
  buildFlatTokenUsage,
  estimateTextTokens,
  extractGeneratedTextForTokenEstimation,
  getFlatTokenUsage,
} from '@renderer/services/chatService/tokenUsage'


// 流式 flush 节流间隔。
// 原为 1000ms，用户感知首字偏慢；降到 500ms 让流式输出更跟手，同时仍比逐 token
// flush 低频，不会把 Pinia 持久化（debounce 2s）和 tiktoken 估算打满。
const STREAM_SYNC_INTERVAL_MS = 500

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

    const generatedAt = Date.now()
    const generatedText = extractGeneratedTextForTokenEstimation(message)
    const hasGeneratedContent = Boolean(generatedText)

    // 保留或设置 outputStartTime：首次检测到任意生成内容时记录时间戳，
    // 包括思考、工具调用和正文，避免深度思考阶段速度为空。
    if (!nextMetadata.outputStartTime) {
      const storeChat = getChatById(chatId)
      const existing = storeChat?.messages.find((m) => m.id === message?.id)
      if (existing?.metadata?.outputStartTime) {
        nextMetadata.outputStartTime = existing.metadata.outputStartTime
      } else if (hasGeneratedContent) {
        nextMetadata.outputStartTime = generatedAt
      }
    }

    if (isFinalized) {
      if (nextMetadata.outputStartTime && !nextMetadata.outputEndTime) {
        nextMetadata.outputEndTime = Date.now()
      }

      const estimatedOutputTokens =
        flatUsage.outputTokens ?? estimateTextTokens(generatedText, nextMetadata.model)
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

  // 把单条流式消息应用到 messages 数组，返回新数组（不修改原数组）。
  // 抽出共享以便 flush 批量合并所有 pending 快照为一次 updateMessages。
  const applySnapshotToMessages = (
    messages: BaseMessage[],
    msgToUpdate: BaseMessage
  ): BaseMessage[] => {
    const existingIndex = messages.findIndex((m) => m.id === msgToUpdate.id)
    if (existingIndex >= 0) {
      const existingMessage = messages[existingIndex]
      if (existingMessage === msgToUpdate) return messages

      const nextMessages = [...messages]
      nextMessages[existingIndex] = {
        ...existingMessage,
        parts: msgToUpdate.parts,
        metadata: msgToUpdate.metadata
      }
      return nextMessages
    }

    if (!targetMessageId.value) {
      return [...messages, msgToUpdate]
    }

    const targetIndex = messages.findIndex((m) => m.id === targetMessageId.value)
    if (targetIndex < 0) {
      return [...messages, msgToUpdate]
    }

    const copy = [...messages]
    const targetMsg = copy[targetIndex]

    if (targetMsg.role === 'assistant') {
      copy[targetIndex] = msgToUpdate
    } else {
      copy.splice(targetIndex + 1, 0, msgToUpdate)
    }

    return copy
  }

  const queueMessageSync = (message?: BaseMessage, error?: APICallError) => {
    const messageSnapshot = createStoreMessageSnapshot(message, error)
    if (!messageSnapshot) return

    if (!pendingSyncMessages.has(messageSnapshot.id)) {
      pendingSyncMessageIds.push(messageSnapshot.id)
    }
    pendingSyncMessages.set(messageSnapshot.id, messageSnapshot)
  }

  const flushStreamingUpdate = (): BaseMessage[] | undefined => {
    if (streamFlushHandle) {
      clearTimeout(streamFlushHandle)
      streamFlushHandle = null
    }

    const messagesToSync = pendingSyncMessageIds
      .map((id) => pendingSyncMessages.get(id))
      .filter((message): message is BaseMessage => Boolean(message))

    pendingSyncMessageIds.length = 0
    pendingSyncMessages.clear()

    let nextMessages: BaseMessage[] | undefined

    const storeChat = getChatById(chatId)
    if (storeChat && messagesToSync.length > 0) {
      nextMessages = storeChat.messages
      for (const message of messagesToSync) {
        const snapshot = createStoreMessageSnapshot(message)
        if (!snapshot) continue
        nextMessages = applySnapshotToMessages(nextMessages, snapshot)
      }
      updateMessages(chatId, nextMessages)
    }

    onStreamingUpdate(pendingSpeechMessage, pendingStreamParts)
    pendingSpeechMessage = undefined
    pendingStreamParts = undefined
    return nextMessages
  }

  const finalizeMessageSync = async (message?: BaseMessage, error?: APICallError) => {
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
    const updatedMessages = flushStreamingUpdate()

    const chatsStore = useChatsStores()
    const preview = message?.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('')
      .slice(0, 200)
    chatsStore.updateChatSummaryMeta(chatId, {
      messageCount: updatedMessages?.length || 0,
      lastMessageAt: Date.now(),
      ...(preview ? { lastMessagePreview: preview } : {})
    })
  }

  const scheduleStreamingUpdate = (message?: BaseMessage) => {
    if (!message) return

    // 只存消息引用，不在每个流式 token 上创建快照。
    // 每次 watcher 触发都会用最新的 lastMessage 覆盖同 id 的引用，
    // 因此 flush 时拿到的一定是最新状态；快照创建（含 parts 拷贝、usage 计算、
    // stop 包装）统一延迟到 flushStreamingUpdate 中执行，
    // 避免高频 token 更新下每帧都做一次 createStoreMessageSnapshot 的开销。
    if (!pendingSyncMessages.has(message.id)) {
      pendingSyncMessageIds.push(message.id)
    }
    pendingSyncMessages.set(message.id, message)

    pendingStreamParts = message.parts as
      | (TextUIPart | ToolUIPart | FileUIPart)[]
      | undefined
    pendingSpeechMessage = message.role === 'assistant' ? message : undefined

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
