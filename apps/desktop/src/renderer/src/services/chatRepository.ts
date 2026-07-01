const forIpc = <T>(obj: T): T => JSON.parse(JSON.stringify(obj))

export const chatRepository = {
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
