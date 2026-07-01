import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

export const chats = sqliteTable('chat', {
  id: text('id').primaryKey(),
  title: text('title').notNull().default('新的聊天'),
  agentId: text('agent_id'),
  providerId: text('provider_id'),
  modelId: text('model_id'),
  isTemp: integer('is_temp').notNull().default(0),
  parentChatId: text('parent_chat_id'),
  subTask: text('sub_task'),
  toolFeaturesEnabled: integer('tool_features_enabled').notNull().default(1),
  compressedContext: text('compressed_context'),
  selectedMcpResources: text('selected_mcp_resources'),
  isCollected: integer('is_collected').notNull().default(0),
  messageCount: integer('message_count').notNull().default(0),
  lastMessageAt: integer('last_message_at'),
  lastMessagePreview: text('last_message_preview'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
}, (table) => [
  index('idx_chat_updated_at').on(table.updatedAt),
  index('idx_chat_parent').on(table.parentChatId)
])

export const messages = sqliteTable('message', {
  id: text('id').primaryKey(),
  chatId: text('chat_id')
    .notNull()
    .references(() => chats.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  seq: integer('seq').notNull(),
  metadata: text('metadata').notNull().default('{}'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
}, (table) => [
  uniqueIndex('uniq_message_chat_seq').on(table.chatId, table.seq),
  index('idx_message_chat_seq').on(table.chatId, table.seq)
])

export const parts = sqliteTable('part', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  messageId: text('message_id')
    .notNull()
    .references(() => messages.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  idx: integer('idx').notNull(),
  content: text('content').notNull().default('{}'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
}, (table) => [
  uniqueIndex('uniq_part_message_idx').on(table.messageId, table.idx),
  index('idx_part_message_idx').on(table.messageId, table.idx)
])
