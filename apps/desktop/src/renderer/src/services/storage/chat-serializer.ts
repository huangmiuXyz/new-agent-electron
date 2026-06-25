import { STORAGE_KEY_MESSAGES_PREFIX } from './constants'

export const messagesKey = (chatId: string) => `${STORAGE_KEY_MESSAGES_PREFIX}${chatId}`

export const isMessagesKey = (key: string) => key.startsWith(STORAGE_KEY_MESSAGES_PREFIX)

export const chatIdFromKey = (key: string) => key.slice(STORAGE_KEY_MESSAGES_PREFIX.length)

const sanitizeMetadata = (metadata: MetaData | undefined): MetaData | undefined => {
  if (!metadata) return metadata
  const { stop, ...rest } = metadata as any
  return rest as MetaData
}

const cloneForStorage = <T>(value: T): T => {
  return JSON.parse(JSON.stringify(value))
}

export const messagesToRecords = (chatId: string, messages: BaseMessage[]): ChatMessageRecord[] => {
  return messages.map((msg, index) => ({
    id: msg.id,
    chatId,
    role: msg.role,
    parts: cloneForStorage(msg.parts),
    metadata: cloneForStorage(sanitizeMetadata(msg.metadata)),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    order: index
  }))
}

export const recordsToMessages = (records: ChatMessageRecord[]): BaseMessage[] => {
  return records.map((r) => ({
    id: r.id,
    role: r.role,
    parts: r.parts,
    metadata: r.metadata
  }) as BaseMessage)
}
