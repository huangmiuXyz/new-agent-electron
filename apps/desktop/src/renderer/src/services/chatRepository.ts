import localforage from 'localforage'
import { CURRENT_SCHEMA_VERSION } from './storage/constants'
import { messagesKey, isMessagesKey, chatIdFromKey, messagesToRecords, recordsToMessages } from './storage/chat-serializer'

const loadRecords = async (chatId: string): Promise<ChatMessageRecord[]> => {
  return (await localforage.getItem<ChatMessageRecord[]>(messagesKey(chatId))) || []
}

const saveRecords = async (chatId: string, records: ChatMessageRecord[]): Promise<void> => {
  await localforage.setItem(messagesKey(chatId), records)
}

const buildWindow = (
  chatId: string,
  records: ChatMessageRecord[],
  hasMoreBefore: boolean
): LoadedMessageWindow => {
  const messages = recordsToMessages(records)
  return {
    chatId,
    messages,
    hasMoreBefore,
    oldestOrder: records.length > 0 ? records[0].order : undefined,
    newestOrder: records.length > 0 ? records[records.length - 1].order : undefined
  }
}

export const chatRepository = {
  async deleteChatMessages(chatId: string): Promise<void> {
    await localforage.removeItem(messagesKey(chatId))
  },

  async loadRecentMessages(chatId: string, limit: number): Promise<LoadedMessageWindow> {
    const records = await loadRecords(chatId)
    const start = Math.max(0, records.length - limit)
    const batch = records.slice(start)
    return buildWindow(chatId, batch, records.length > limit)
  },

  async loadMessagesBefore(chatId: string, beforeOrder: number, limit: number): Promise<LoadedMessageWindow> {
    const records = await loadRecords(chatId)
    const before = records
      .filter((r) => r.order < beforeOrder)
      .sort((a, b) => b.order - a.order)
      .slice(0, limit)
      .sort((a, b) => a.order - b.order)
    return buildWindow(chatId, before, before.length >= limit)
  },

  async loadAllMessages(chatId: string): Promise<BaseMessage[]> {
    const records = await loadRecords(chatId)
    return recordsToMessages(records)
  },

  async replaceMessages(chatId: string, messages: BaseMessage[]): Promise<void> {
    await saveRecords(chatId, messagesToRecords(chatId, messages))
  },

  async replaceMessagesFrom(chatId: string, anchorMessageId: string, messages: BaseMessage[]): Promise<void> {
    const records = await loadRecords(chatId)
    const anchorIdx = records.findIndex((r) => r.id === anchorMessageId)
    if (anchorIdx === -1) {
      await saveRecords(chatId, messagesToRecords(chatId, messages))
      return
    }
    const kept = records.slice(0, anchorIdx)
    const newRecords = messagesToRecords(chatId, messages)
    const reindexed = [...kept, ...newRecords].map((r, i) => ({ ...r, order: i }))
    await saveRecords(chatId, reindexed)
  },

  async appendMessages(chatId: string, messages: BaseMessage[]): Promise<void> {
    const records = await loadRecords(chatId)
    const newRecords = messagesToRecords(chatId, messages).map((r, i) => ({ ...r, order: records.length + i }))
    await saveRecords(chatId, [...records, ...newRecords])
  },

  async exportSnapshot(options: {
    summaries: ChatSummary[]
    activeChatId: string | null
    chatDrafts: Record<string, string>
  }): Promise<ChatRepositorySnapshot> {
    const keys = await localforage.keys()
    const messageKeys = keys.filter(isMessagesKey)
    const messagesByChatId: Record<string, ChatMessageRecord[]> = {}
    for (const key of messageKeys) {
      const chatId = chatIdFromKey(key)
      const records = (await localforage.getItem<ChatMessageRecord[]>(key)) || []
      messagesByChatId[chatId] = records
    }
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      summaries: options.summaries,
      messagesByChatId,
      activeChatId: options.activeChatId,
      chatDrafts: options.chatDrafts
    }
  },

  async importSnapshot(snapshot: ChatRepositorySnapshot): Promise<void> {
    for (const [chatId, records] of Object.entries(snapshot.messagesByChatId)) {
      await localforage.setItem(messagesKey(chatId), records)
    }
  },

  async clearAllChatMessages(): Promise<void> {
    const keys = await localforage.keys()
    const messageKeys = keys.filter(isMessagesKey)
    await Promise.all(messageKeys.map((key) => localforage.removeItem(key)))
  }
}
