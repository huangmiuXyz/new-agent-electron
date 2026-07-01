const forIpc = <T>(obj: T): T => JSON.parse(JSON.stringify(obj))

export const chatStreamPersistence = {
  async upsertMessageSnapshot(chatId: string, message: BaseMessage, seqHint?: number): Promise<void> {
    await window.api.chatDb.message.upsert(chatId, forIpc(message), seqHint)
  },

  async upsertPart(messageId: string, idx: number, part: BaseMessage['parts'][number]): Promise<void> {
    await window.api.chatDb.message.upsertPart(messageId, idx, forIpc(part))
  },

  async updateMetadata(messageId: string, metadata: MetaData): Promise<void> {
    await window.api.chatDb.message.updateMetadata(messageId, forIpc(metadata))
  },

  async finalizeMessage(chatId: string, message: BaseMessage): Promise<void> {
    await window.api.chatDb.message.finalize(chatId, forIpc(message))
  }
}
