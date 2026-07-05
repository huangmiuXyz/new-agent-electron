/**
 * 深拷贝对象，剥离函数类型属性（如 metadata.stop）。
 * 相比 JSON.parse(JSON.stringify()) 不创建中间 JSON 字符串，
 * 字符串按引用共享，避免大 base64 数据产生双倍临时内存。
 */
const forIpc = <T>(obj: T): T => {
  if (obj === null || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(forIpc) as T
  const result: Record<string, any> = {}
  for (const key in obj) {
    if (!Object.prototype.hasOwnProperty.call(obj, key)) continue
    const val = (obj as any)[key]
    if (typeof val === 'function') continue
    result[key] = val !== null && typeof val === 'object' ? forIpc(val) : val
  }
  return result as T
}

export const chatRepository = {
  async deleteMessage(messageId: string): Promise<void> {
    await window.api.chatDb.message.delete(messageId)
  },

  async replaceMessageParts(messageId: string, parts: BaseMessage['parts']): Promise<void> {
    await window.api.chatDb.message.replaceParts(messageId, forIpc(parts))
  },

  async updateMessageMetadata(messageId: string, metadata: MetaData): Promise<void> {
    await window.api.chatDb.message.updateMetadata(messageId, forIpc(metadata))
  },

  async deleteChatMessages(chatId: string): Promise<void> {
    await window.api.chatDb.message.deleteAll(chatId)
  },

  async loadRecentMessages(chatId: string, limit: number): Promise<LoadedMessageWindow> {
    return await window.api.chatDb.message.loadRecent(chatId, limit)
  },

  async loadMessagesBefore(chatId: string, beforeOrder: number, limit: number): Promise<LoadedMessageWindow> {
    return await window.api.chatDb.message.loadBefore(chatId, beforeOrder, limit)
  },

  async loadAllMessages(chatId: string): Promise<BaseMessage[]> {
    return await window.api.chatDb.message.loadAll(chatId)
  },

  async replaceMessages(chatId: string, messages: BaseMessage[]): Promise<void> {
    await window.api.chatDb.message.replaceAll(chatId, forIpc(messages))
  },

  async replaceMessagesFrom(chatId: string, anchorMessageId: string, messages: BaseMessage[]): Promise<void> {
    await window.api.chatDb.message.replaceFrom(chatId, anchorMessageId, forIpc(messages))
  },

  async appendMessages(chatId: string, messages: BaseMessage[]): Promise<void> {
    await window.api.chatDb.message.append(chatId, forIpc(messages))
  },

  async exportSnapshot(options: {
    summaries: ChatSummary[]
    activeChatId: string | null
    chatDrafts: Record<string, string>
  }): Promise<ChatRepositorySnapshot> {
    return await window.api.chatDb.snapshot.export(forIpc(options))
  },

  async importSnapshot(snapshot: ChatRepositorySnapshot): Promise<void> {
    await window.api.chatDb.snapshot.import(forIpc(snapshot))
  },

  async clearAllChatMessages(): Promise<void> {
    await window.api.chatDb.message.clearAll()
  }
}
