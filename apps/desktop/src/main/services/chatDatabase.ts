import { eq, desc } from 'drizzle-orm'
import { getDb, getSqliteDb } from '../db/chatDb'
import { chats, messages, parts } from '../db/chatSchema'

interface MessageRow {
  id: string
  chat_id: string
  role: string
  seq: number
  metadata: string
  created_at: number
  updated_at: number
  type: string | null
  content: string | null
  idx: number | null
}

interface MergedMessage {
  id: string
  role: string
  seq: number
  metadata: string
  created_at: number
  updated_at: number
  parts_data: { type: string; content: string; idx: number }[]
}

const messageToBaseMessage = (row: MergedMessage): BaseMessage => {
  return {
    id: row.id,
    role: row.role as BaseMessage['role'],
    parts: row.parts_data
      .sort((a, b) => a.idx - b.idx)
      .map((p) => JSON.parse(p.content) as BaseMessage['parts'][number]),
    metadata: JSON.parse(row.metadata) as MetaData
  } as BaseMessage
}

const chatRowToSummary = (row: typeof chats.$inferSelect): ChatSummary => ({
  id: row.id,
  title: row.title,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  agentId: row.agentId ?? undefined,
  providerId: row.providerId ?? undefined,
  modelId: row.modelId ?? undefined,
  isTemp: !!row.isTemp,
  parentChatId: row.parentChatId ?? undefined,
  subTask: row.subTask ? JSON.parse(row.subTask) : undefined,
  toolFeaturesEnabled: !!row.toolFeaturesEnabled,
  compressedContext: row.compressedContext ? JSON.parse(row.compressedContext) : undefined,
  selectedMcpResources: row.selectedMcpResources ? JSON.parse(row.selectedMcpResources) : undefined,
  is_collected: !!row.isCollected,
  messageCount: row.messageCount,
  lastMessageAt: row.lastMessageAt ?? undefined,
  lastMessagePreview: row.lastMessagePreview ?? undefined
})

const summaryToChatRow = (summary: ChatSummary) => ({
  id: summary.id,
  title: summary.title,
  agentId: summary.agentId ?? null,
  providerId: summary.providerId ?? null,
  modelId: summary.modelId ?? null,
  isTemp: summary.isTemp ? 1 : 0,
  parentChatId: summary.parentChatId ?? null,
  subTask: summary.subTask ? JSON.stringify(summary.subTask) : null,
  toolFeaturesEnabled: summary.toolFeaturesEnabled !== false ? 1 : 0,
  compressedContext: summary.compressedContext ? JSON.stringify(summary.compressedContext) : null,
  selectedMcpResources: summary.selectedMcpResources ? JSON.stringify(summary.selectedMcpResources) : null,
  isCollected: summary.is_collected ? 1 : 0,
  messageCount: summary.messageCount ?? 0,
  lastMessageAt: summary.lastMessageAt ?? null,
  lastMessagePreview: summary.lastMessagePreview ?? null,
  createdAt: summary.createdAt,
  updatedAt: summary.updatedAt ?? Date.now()
})

const buildWindow = (
  chatId: string,
  rows: MergedMessage[],
  hasMoreBefore: boolean
): LoadedMessageWindow => {
  const baseMessages = rows.map(messageToBaseMessage)
  return {
    chatId,
    messages: baseMessages,
    hasMoreBefore,
    oldestOrder: rows.length > 0 ? rows[0].seq : undefined,
    newestOrder: rows.length > 0 ? rows[rows.length - 1].seq : undefined
  }
}

function mergeMessageRows(rows: MessageRow[]): MergedMessage[] {
  const map = new Map<string, MergedMessage>()
  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, {
        id: row.id,
        role: row.role,
        seq: row.seq,
        metadata: row.metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
        parts_data: []
      })
    }
    if (row.type) {
      map.get(row.id)!.parts_data.push({ type: row.type, content: row.content!, idx: row.idx! })
    }
  }
  return Array.from(map.values())
}

function mergeMessageRowsFromDesc(rows: MessageRow[], limit: number): MergedMessage[] {
  const map = new Map<string, MergedMessage>()
  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, {
        id: row.id,
        role: row.role,
        seq: row.seq,
        metadata: row.metadata,
        created_at: row.created_at,
        updated_at: row.updated_at,
        parts_data: []
      })
    }
    if (row.type) {
      const entry = map.get(row.id)!
      if (!entry.parts_data.some((p) => p.idx === row.idx)) {
        entry.parts_data.push({ type: row.type, content: row.content!, idx: row.idx! })
      }
    }
  }
  let result = Array.from(map.values()).sort((a, b) => a.seq - b.seq)
  if (limit > 0 && result.length > limit) {
    result = result.slice(result.length - limit)
  }
  return result
}

function mergeToRecords(rows: MessageRow[]): ChatMessageRecord[] {
  const map = new Map<string, ChatMessageRecord>()
  for (const row of rows) {
    if (!map.has(row.id)) {
      map.set(row.id, {
        id: row.id,
        chatId: row.chat_id,
        role: row.role as BaseMessage['role'],
        parts: [],
        metadata: JSON.parse(row.metadata ?? '{}'),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        order: row.seq
      })
    }
    if (row.type) {
      map.get(row.id)!.parts.push(JSON.parse(row.content!))
    }
  }
  return Array.from(map.values()).sort((a, b) => a.order - b.order)
}

const INSERT_MESSAGE = 'INSERT INTO message (id, chat_id, role, seq, metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
const INSERT_PART = 'INSERT INTO part (message_id, type, idx, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
const DELETE_MESSAGE_BY_CHAT = 'DELETE FROM message WHERE chat_id = ?'
const DELETE_MESSAGE_BY_CHAT_SEQ = 'DELETE FROM message WHERE chat_id = ? AND seq >= ?'
const DELETE_PART_BY_MESSAGE = 'DELETE FROM part WHERE message_id = ?'
const SELECT_MESSAGE_WITH_PARTS = `
  SELECT m.id, m.chat_id, m.role, m.seq, m.metadata, m.created_at, m.updated_at,
         p.type, p.content, p.idx
  FROM message m
  LEFT JOIN part p ON p.message_id = m.id
`
const SELECT_LAST_SEQ = 'SELECT COALESCE(MAX(seq), -1) as s FROM message WHERE chat_id = ?'

function insertMessagesInTx(chatId: string, messagesList: BaseMessage[], startSeq: number): void {
  const db = getSqliteDb()
  const now = Date.now()
  for (let i = 0; i < messagesList.length; i++) {
    const msg = messagesList[i]
    db.prepare(INSERT_MESSAGE).run(msg.id, chatId, msg.role, startSeq + i, JSON.stringify(msg.metadata ?? {}), now, now)
    for (let j = 0; j < (msg.parts?.length ?? 0); j++) {
      const part = msg.parts![j]
      db.prepare(INSERT_PART).run(msg.id, part.type, j, JSON.stringify(part), now, now)
    }
  }
}

function ensureChatRowExists(chatId: string): void {
  const db = getSqliteDb()
  const existing = db.prepare('SELECT id FROM chat WHERE id = ?').get(chatId) as { id: string } | undefined
  if (!existing) {
    db.prepare(`
      INSERT INTO chat (id, title, is_temp, message_count, created_at, updated_at)
      VALUES (?, '', 0, 0, ?, ?)
    `).run(chatId, Date.now(), Date.now())
  }
}

export const chatDatabaseService = {
  async listChats(): Promise<ChatSummary[]> {
    const db = getDb()
    const rows = await db.select().from(chats).orderBy(desc(chats.updatedAt))
    return rows.map(chatRowToSummary)
  },

  async createChat(summary: ChatSummary): Promise<void> {
    const db = getDb()
    await db.insert(chats).values(summaryToChatRow(summary)).run()
  },

  async updateChatMeta(chatId: string, updates: Partial<ChatSummary>): Promise<void> {
    const db = getDb()
    const row: Record<string, unknown> = { updatedAt: Date.now() }
    if (updates.title !== undefined) row.title = updates.title
    if (updates.agentId !== undefined) row.agentId = updates.agentId
    if (updates.providerId !== undefined) row.providerId = updates.providerId
    if (updates.modelId !== undefined) row.modelId = updates.modelId
    if (updates.isTemp !== undefined) row.isTemp = updates.isTemp ? 1 : 0
    if (updates.parentChatId !== undefined) row.parentChatId = updates.parentChatId ?? null
    if (updates.subTask !== undefined) row.subTask = updates.subTask ? JSON.stringify(updates.subTask) : null
    if (updates.toolFeaturesEnabled !== undefined) row.toolFeaturesEnabled = updates.toolFeaturesEnabled ? 1 : 0
    if (updates.compressedContext !== undefined) row.compressedContext = updates.compressedContext ? JSON.stringify(updates.compressedContext) : null
    if (updates.selectedMcpResources !== undefined) row.selectedMcpResources = updates.selectedMcpResources ? JSON.stringify(updates.selectedMcpResources) : null
    if (updates.is_collected !== undefined) row.isCollected = updates.is_collected ? 1 : 0
    if (updates.messageCount !== undefined) row.messageCount = updates.messageCount
    if (updates.lastMessageAt !== undefined) row.lastMessageAt = updates.lastMessageAt ?? null
    if (updates.lastMessagePreview !== undefined) row.lastMessagePreview = updates.lastMessagePreview ?? null

    await db.update(chats).set(row).where(eq(chats.id, chatId)).run()
  },

  async deleteChat(chatId: string): Promise<void> {
    const db = getDb()
    await db.delete(chats).where(eq(chats.id, chatId)).run()
  },

  async loadRecentMessages(chatId: string, limit: number): Promise<LoadedMessageWindow> {
    const db = getSqliteDb()
    const rows = db.prepare(`${SELECT_MESSAGE_WITH_PARTS} WHERE m.chat_id = ? ORDER BY m.seq ASC, p.idx ASC`).all(chatId) as MessageRow[]

    const merged = mergeMessageRows(rows)
    const sliced = limit > 0 && merged.length > limit ? merged.slice(merged.length - limit) : merged
    return buildWindow(chatId, sliced, merged.length > limit)
  },

  async loadMessagesBefore(chatId: string, beforeOrder: number, limit: number): Promise<LoadedMessageWindow> {
    const db = getSqliteDb()
    const rows = db.prepare(`${SELECT_MESSAGE_WITH_PARTS} WHERE m.chat_id = ? AND m.seq < ? ORDER BY m.seq DESC, p.idx ASC`).all(chatId, beforeOrder) as MessageRow[]

    const merged = mergeMessageRowsFromDesc(rows, limit)
    return buildWindow(chatId, merged, merged.length >= limit)
  },

  async loadAllMessages(chatId: string): Promise<BaseMessage[]> {
    const db = getSqliteDb()
    const rows = db.prepare(`${SELECT_MESSAGE_WITH_PARTS} WHERE m.chat_id = ? ORDER BY m.seq ASC, p.idx ASC`).all(chatId) as MessageRow[]

    const merged = mergeMessageRows(rows)
    return merged.map(messageToBaseMessage)
  },

  async replaceMessages(chatId: string, messagesList: BaseMessage[]): Promise<void> {
    const db = getSqliteDb()
    ensureChatRowExists(chatId)
    const tx = db.transaction(() => {
      db.prepare(DELETE_MESSAGE_BY_CHAT).run(chatId)
      insertMessagesInTx(chatId, messagesList, 0)
    })
    tx()
  },

  async replaceMessagesFrom(chatId: string, anchorMessageId: string, messagesList: BaseMessage[]): Promise<void> {
    const db = getSqliteDb()
    ensureChatRowExists(chatId)
    const anchor = db.prepare('SELECT seq FROM message WHERE id = ?').get(anchorMessageId) as { seq: number } | undefined
    if (!anchor) {
      await this.replaceMessages(chatId, messagesList)
      return
    }
    const tx = db.transaction(() => {
      db.prepare(DELETE_MESSAGE_BY_CHAT_SEQ).run(chatId, anchor.seq)
      insertMessagesInTx(chatId, messagesList, anchor.seq)
    })
    tx()
  },

  async appendMessages(chatId: string, messagesList: BaseMessage[]): Promise<void> {
    const db = getSqliteDb()
    ensureChatRowExists(chatId)
    const lastSeq = (db.prepare(SELECT_LAST_SEQ).get(chatId) as { s: number }).s
    const tx = db.transaction(() => {
      insertMessagesInTx(chatId, messagesList, lastSeq + 1)
    })
    tx()
  },

  async deleteChatMessages(chatId: string): Promise<void> {
    const db = getDb()
    await db.delete(messages).where(eq(messages.chatId, chatId)).run()
  },

  async clearAllChatMessages(): Promise<void> {
    const db = getDb()
    await db.delete(parts).run()
    await db.delete(messages).run()
    await db.delete(chats).run()
  },

  async upsertMessage(chatId: string, message: BaseMessage, seqHint?: number): Promise<void> {
    ensureChatRowExists(chatId)
    const drizzleDb = getDb()
    const now = Date.now()
    const metadata = JSON.stringify(message.metadata ?? {})
    const existing = await drizzleDb.select({ id: messages.id }).from(messages).where(eq(messages.id, message.id)).limit(1)
    if (existing.length > 0) {
      await drizzleDb.update(messages).set({ role: message.role, metadata, updatedAt: now }).where(eq(messages.id, message.id)).run()
    } else {
      const sqliteDb = getSqliteDb()
      let seq = seqHint
      if (seq === undefined) {
        seq = (sqliteDb.prepare(SELECT_LAST_SEQ).get(chatId) as { s: number }).s + 1
      }
      await drizzleDb.insert(messages).values({ id: message.id, chatId, role: message.role, seq, metadata, createdAt: now, updatedAt: now }).run()
    }
  },

  async replaceMessageParts(messageId: string, partsList: BaseMessage['parts']): Promise<void> {
    const db = getSqliteDb()
    const now = Date.now()
    const tx = db.transaction(() => {
      db.prepare(DELETE_PART_BY_MESSAGE).run(messageId)
      for (let i = 0; i < partsList.length; i++) {
        const part = partsList[i]
        db.prepare(INSERT_PART).run(messageId, part.type, i, JSON.stringify(part), now, now)
      }
    })
    tx()
  },

  async upsertMessagePart(messageId: string, idx: number, part: BaseMessage['parts'][number]): Promise<void> {
    const db = getDb()
    const now = Date.now()
    const content = JSON.stringify(part)
    await db.insert(parts).values({
      messageId, idx, type: part.type, content, createdAt: now, updatedAt: now
    }).onConflictDoUpdate({
      target: [parts.messageId, parts.idx],
      set: { type: part.type, content, updatedAt: now }
    }).run()
  },

  async updateMessageMetadata(messageId: string, metadata: MetaData): Promise<void> {
    const db = getDb()
    await db.update(messages).set({ metadata: JSON.stringify(metadata), updatedAt: Date.now() }).where(eq(messages.id, messageId)).run()
  },

  async finalizeMessage(chatId: string, message: BaseMessage): Promise<void> {
    const db = getSqliteDb()
    ensureChatRowExists(chatId)
    const now = Date.now()
    const tx = db.transaction(() => {
      const existing = db.prepare('SELECT id FROM message WHERE id = ?').get(message.id) as { id: string } | undefined
      if (existing) {
        db.prepare('UPDATE message SET role = ?, metadata = ?, updated_at = ? WHERE id = ?').run(message.role, JSON.stringify(message.metadata ?? {}), now, message.id)
      } else {
        const seq = (db.prepare(SELECT_LAST_SEQ).get(chatId) as { s: number }).s + 1
        db.prepare(INSERT_MESSAGE).run(message.id, chatId, message.role, seq, JSON.stringify(message.metadata ?? {}), now, now)
      }
      db.prepare(DELETE_PART_BY_MESSAGE).run(message.id)
      for (let i = 0; i < (message.parts?.length ?? 0); i++) {
        const part = message.parts![i]
        db.prepare(INSERT_PART).run(message.id, part.type, i, JSON.stringify(part), now, now)
      }
      const totalMessages = (db.prepare('SELECT COUNT(*) as c FROM message WHERE chat_id = ?').get(chatId) as { c: number }).c
      const preview = message.parts
        ?.filter((p): p is { type: 'text'; text: string } => p.type === 'text')
        .map((p) => p.text)
        .join('')
        .slice(0, 200)
      db.prepare('UPDATE chat SET message_count = ?, last_message_at = ?, last_message_preview = ?, updated_at = ? WHERE id = ?').run(totalMessages, now, preview ?? null, now, chatId)
    })
    tx()
  },

  async exportSnapshot(options: {
    summaries: ChatSummary[]
    activeChatId: string | null
    chatDrafts: Record<string, string>
  }): Promise<ChatRepositorySnapshot> {
    const db = getSqliteDb()
    const messagesByChatId: Record<string, ChatMessageRecord[]> = {}
    for (const summary of options.summaries) {
      const rows = db.prepare(`${SELECT_MESSAGE_WITH_PARTS} WHERE m.chat_id = ? ORDER BY m.seq ASC, p.idx ASC`).all(summary.id) as MessageRow[]
      messagesByChatId[summary.id] = mergeToRecords(rows)
    }
    return {
      schemaVersion: 2,
      summaries: options.summaries,
      messagesByChatId,
      activeChatId: options.activeChatId,
      chatDrafts: options.chatDrafts
    }
  },

  async importSnapshot(snapshot: ChatRepositorySnapshot): Promise<void> {
    const db = getSqliteDb()
    const tx = db.transaction(() => {
      db.prepare('DELETE FROM part').run()
      db.prepare('DELETE FROM message').run()
      db.prepare('DELETE FROM chat').run()
      for (const summary of snapshot.summaries) {
        const row = summaryToChatRow(summary)
        db.prepare(`
          INSERT INTO chat (id, title, agent_id, provider_id, model_id, is_temp, parent_chat_id, sub_task,
            tool_features_enabled, compressed_context, selected_mcp_resources, is_collected,
            message_count, last_message_at, last_message_preview, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          row.id, row.title, row.agentId, row.providerId, row.modelId, row.isTemp,
          row.parentChatId, row.subTask, row.toolFeaturesEnabled, row.compressedContext,
          row.selectedMcpResources, row.isCollected, row.messageCount, row.lastMessageAt,
          row.lastMessagePreview, row.createdAt, row.updatedAt
        )
      }
      for (const [chatId, records] of Object.entries(snapshot.messagesByChatId)) {
        for (const record of records) {
          db.prepare(INSERT_MESSAGE).run(record.id, chatId, record.role, record.order, JSON.stringify(record.metadata ?? {}), record.createdAt, record.updatedAt)
          for (let i = 0; i < (record.parts?.length ?? 0); i++) {
            const part = record.parts[i]
            db.prepare(INSERT_PART).run(record.id, part.type, i, JSON.stringify(part), record.createdAt, record.updatedAt)
          }
        }
      }
    })
    tx()
  }
}
