/**
 * 深拷贝对象，剥离函数类型属性（如 metadata.stop、translationController）。
 * 
 * 相比 JSON.parse(JSON.stringify()) 的优势：
 * 1. 不创建中间 JSON 字符串——含大量 base64 数据的消息可能产生数 MB 的临时字符串
 * 2. 字符串按引用共享（JS 字符串不可变），不创建副本
 * 3. 保留 Date、RegExp 等 JSON 会破坏的类型
 * 4. 保留数组中的 undefined（JSON.stringify 会转为 null）
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

export const chatStreamPersistence = {
  async upsertMessageSnapshot(chatId: string, message: BaseMessage, seqHint?: number): Promise<void> {
    const _t1 = createTimeLog('持久化-upsertMessageSnapshot')
    // 只传 id/role/metadata，跳过 parts（main process 的 upsertMessage 用不到 parts）
    await window.api.chatDb.message.upsert(chatId, {
      id: message.id,
      role: message.role,
      metadata: forIpc(message.metadata ?? {})
    } as BaseMessage, seqHint)
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

  async finalizeMessage(chatId: string, messageId: string, metadata: MetaData): Promise<void> {
    const _t4 = createTimeLog('持久化-finalizeMessage')
    await window.api.chatDb.message.finalize(chatId, messageId, forIpc(metadata))
    syncTimeLog(_t4, '持久化-finalizeMessage', `messageId=${messageId.slice(0, 8)}`)
  }
}
