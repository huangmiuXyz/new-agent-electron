import type { Ref } from 'vue'
import type { APICallError, FileUIPart, TextUIPart, ToolUIPart } from 'ai'
import {
  buildFlatTokenUsage,
  estimateMessageTokens,
  getFlatTokenUsage
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

    // 批量合并：所有 pending 快照一次性应用到一个新数组，只触发一次 updateMessages，
    // 避免多条 pending（如工具循环多 step）时多次响应式更新 + 多次数组拷贝。
    // 只要 messagesToSync 非空就一定调 updateMessages，不做 changed 跳过判断，
    // 确保响应式始终触发（即使内容相同也用新数组引用替换，保证 visibleMessages
    // computed 重新求值、v-memo 重新校验）。
    const storeChat = getChatById(chatId)
    if (storeChat && messagesToSync.length > 0) {
      let nextMessages = storeChat.messages
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
