const forIpc = <T>(obj: T): T => JSON.parse(JSON.stringify(obj))

export const chatStreamPersistence = {
  async upsertMessageSnapshot(chatId: string, message: BaseMessage, seqHint?: number): Promise<void> {
    const _t1 = createTimeLog('持久化-upsertMessageSnapshot')
    await window.api.chatDb.message.upsert(chatId, forIpc(message), seqHint)
    syncTimeLog(_t1, '持久化-upsertMessageSnapshot', `parts=${message.parts.length} role=${message.role}`)
  },

  async upsertPart(messageId: string, idx: number, part: BaseMessage['parts'][number]): Promise<void> {
    const _t2 = createTimeLog('持久化-upsertPart')
    await window.api.chatDb.message.upsertPart(messageId, idx, forIpc(part))
    const type = part.type
    const len = 'text' in part ? (part.text as string)?.length : 'image' in part ? '<image>' : `${JSON.stringify(part).length}`
    syncTimeLog(_t2, '持久化-upsertPart', `idx=${idx} type=${type} len=${len}`)
  },

  async updateMetadata(messageId: string, metadata: MetaData): Promise<void> {
    const _t3 = createTimeLog('持久化-updateMetadata')
    await window.api.chatDb.message.updateMetadata(messageId, forIpc(metadata))
    syncTimeLog(_t3, '持久化-updateMetadata', `keys=${Object.keys(metadata).join(',')}`)
  },

  async finalizeMessage(chatId: string, message: BaseMessage): Promise<void> {
    const _t4 = createTimeLog('持久化-finalizeMessage')
    await window.api.chatDb.message.finalize(chatId, forIpc(message))
    syncTimeLog(_t4, '持久化-finalizeMessage', `parts=${message.parts.length} role=${message.role}`)
  }
}
