# 聊天存储 SQLite 迁移方案

> 版本: 4.0
> 日期: 2026-07-01
> 状态: 待实施

## 1. 目标

将聊天持久化从 `localforage` / IndexedDB 迁移到 SQLite。

迁移后：

- SQLite 是聊天数据的唯一持久化源。
- Pinia 只保留运行时缓存，不再持久化 `chatSummaries`。
- 聊天消息按 `chat / message / part` 三表存储。
- 流式回复走 message/part 级写入，不再整段消息数组全量序列化。

本方案不考虑旧 IndexedDB 聊天数据迁移。

## 2. 当前问题

当前消息存储在 IndexedDB 中：

```text
key: messages:{chatId}
value: ChatMessageRecord[]
```

每次持久化都会写入整个聊天的消息数组。流式回复期间，即使只更新最后一条 assistant 消息里的最后一个 text part，也会触发：

```text
updateMessages
  -> chatRepository.replaceMessages(chatId, nextMessages)
  -> messagesToRecords(chatId, allMessages)
  -> localforage.setItem(messages:{chatId}, allRecords)
```

这会带来两类开销：

- 对全部 messages/parts 做 `JSON.stringify`。
- 将整个聊天历史重新写入 IndexedDB。

SQLite 迁移的核心不是单纯更换存储介质，而是把热路径改成行级写入。

## 3. 数据归属

### 3.1 SQLite 持久化

SQLite 持久化以下数据：

- 聊天列表元数据：`chat`
- 消息主体：`message`
- 消息内容片段：`part`

### 3.2 Pinia 运行时缓存

Pinia 保留：

- `chatSummaries`
- `activeChatId`
- `activeMessageWindow`
- `messageWindows`
- `tempChats`
- `pendingMessagesMap`

其中 `chatSummaries` 启动时从 SQLite 加载，后续变更同步写入 SQLite。

`chatDrafts` 可以暂时继续保留在 Pinia persist 中。它不参与消息热路径，也不影响本次 SQLite 迁移目标。

## 4. ORM 与 Schema

本次迁移引入 **Drizzle ORM** 作为 SQLite 访问层。

选择 Drizzle 的原因：

- 支持 SQLite 和现有 `better-sqlite3` 驱动。
- schema 用 TypeScript 描述，比直接维护 SQL 更容易读。
- 查询仍然比较贴近 SQLite，不会像重型 ORM 那样隐藏太多行为。
- 类型提示能覆盖表字段、插入数据和查询结果。

约定：

- Drizzle schema 是表结构的主要维护入口。
- 常规 CRUD 使用 Drizzle query builder。
- 只在 Drizzle 表达明显别扭的地方使用少量 raw SQL。
- raw SQL 必须封装在 `ChatDatabaseService` 的具名方法里，不散落到业务代码。
- renderer 不接触 ORM，也不拼 SQL。

推荐新增文件：

```text
apps/desktop/src/main/db/chatSchema.ts
apps/desktop/src/main/db/chatDb.ts
```

### 4.1 Drizzle schema

```ts
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
```

### 4.2 JSON 字段

- `sub_task`
- `compressed_context`
- `selected_mcp_resources`
- `message.metadata`
- `part.content`

这些字段在数据库中保存为 JSON string，在 service 层统一序列化和反序列化。

### 4.3 类型约束

`role` 不加数据库枚举约束。`BaseMessage['role']` 跟随 AI SDK 类型演进，存储层不限制枚举。
`type` 不加 `CHECK`。当前消息 part 可能包含 `text`、`file`、`reasoning`、`step-start`、`dynamic-tool`、`tool-*` 等类型，存储层应保持透明。

`content` 存储完整 part JSON。例如：

```json
{ "type": "text", "text": "你好" }
```

读取时直接 `JSON.parse(content)` 还原为 `BaseMessage['parts'][number]`。

### 4.4 迁移生成

使用 `drizzle-kit` 生成 SQLite migration 文件。开发者主要维护 `chatSchema.ts`，不要手写建表 SQL。

建议命令：

```text
pnpm add drizzle-orm
pnpm add -D drizzle-kit
```

## 5. Repository 合约

SQLite 版本的 `chatRepository` 需要覆盖现有调用方依赖的完整合约。

### 5.1 Chat API

```ts
listChats(): Promise<ChatSummary[]>
createChat(summary: ChatSummary): Promise<void>
updateChatMeta(chatId: string, updates: Partial<ChatSummary>): Promise<void>
deleteChat(chatId: string): Promise<void>
```

对应 store 调整：

- `initializeChatsStore` 启动时调用 `listChats()`。
- `createChat` 创建非临时聊天时写入 `chat` 表。
- `renameChat` / `setChatAgent` / `setChatModel` / `setChatToolFeaturesEnabled` / `updateSubTask` / `togglePinChat` / `updateChatSummaryMeta` 更新内存后同步写 SQLite。
- `deleteChat` 删除 `chat` 行，依赖 `ON DELETE CASCADE` 删除消息和 parts。

### 5.2 Message API

```ts
loadRecentMessages(chatId: string, limit: number): Promise<LoadedMessageWindow>
loadMessagesBefore(chatId: string, beforeOrder: number, limit: number): Promise<LoadedMessageWindow>
loadAllMessages(chatId: string): Promise<BaseMessage[]>
replaceMessages(chatId: string, messages: BaseMessage[]): Promise<void>
replaceMessagesFrom(chatId: string, anchorMessageId: string, messages: BaseMessage[]): Promise<void>
appendMessages(chatId: string, messages: BaseMessage[]): Promise<void>
deleteChatMessages(chatId: string): Promise<void>
clearAllChatMessages(): Promise<void>
```

这些 API 保持当前语义，避免大面积改调用方。

分页语义：

- `loadRecentMessages(chatId, limit)` 加载 seq 最大的最近 N 条，返回时按 seq 升序。
- `loadMessagesBefore(chatId, beforeOrder, limit)` 加载 `seq < beforeOrder` 的最近 N 条，返回时按 seq 升序。
- `oldestOrder/newestOrder` 对应 `seq`。

### 5.3 Backup API

如果设置页备份仍保留聊天导入导出，SQLite repository 需要继续提供：

```ts
exportSnapshot(options: {
  summaries: ChatSummary[]
  activeChatId: string | null
  chatDrafts: Record<string, string>
}): Promise<ChatRepositorySnapshot>

importSnapshot(snapshot: ChatRepositorySnapshot): Promise<void>
```

导出时从 SQLite 读取 chats 和 messages，组装为现有 `ChatRepositorySnapshot`。导入时可以直接清空现有 chat/message/part 后写入 SQLite。

如果本轮明确不支持备份恢复，需要同步移除设置页入口或禁用聊天部分导入导出。

## 6. 流式写入路径

性能收益依赖流式场景不再调用 `replaceMessages(chatId, nextMessages)`。

新增专用 API：

```ts
upsertMessage(chatId: string, message: BaseMessage, seqHint?: number): Promise<void>
replaceMessageParts(messageId: string, parts: BaseMessage['parts']): Promise<void>
upsertMessagePart(messageId: string, idx: number, part: BaseMessage['parts'][number]): Promise<void>
updateMessageMetadata(messageId: string, metadata: MetaData): Promise<void>
finalizeMessage(chatId: string, message: BaseMessage): Promise<void>
```

### 6.1 Assistant 流式回复

流式开始：

```text
assistant message created
  -> upsertMessage(chatId, message)
  -> upsertMessagePart(messageId, 0, initialTextPart)
```

流式过程中：

```text
text changed
  -> upsertMessagePart(messageId, textPartIndex, latestTextPart)

new tool part appeared
  -> upsertMessagePart(messageId, toolPartIndex, toolPart)

metadata changed
  -> updateMessageMetadata(messageId, metadata)
```

流式结束：

```text
finish
  -> finalizeMessage(chatId, finalMessage)
  -> update chat.message_count / last_message_at / last_message_preview
```

### 6.2 Store 调整

`updateMessages` 继续作为通用慢路径，用于编辑、删除、重试、fork 等低频场景。

流式控制器不应依赖 `updateMessages(..., { persist: true })` 触发全量持久化，而应在 flush 时调用流式专用 API。

建议改造方式：

- `messageSyncController` 仍负责节流和合并消息快照。
- UI 内存状态仍通过 `updateMessages(..., { persist: false })` 更新。
- 持久化由 `messageSyncController` 调用 `upsertMessagePart/updateMessageMetadata/finalizeMessage` 完成。

这样 UI 更新和 SQLite 写入可以解耦，避免为了持久化重写整个消息窗口。

## 7. 架构分层

本次迁移只做必要包装，避免引入过重抽象。目标是把 ORM 访问层、IPC、业务兼容层和流式热路径分清楚。

推荐结构：

```text
apps/desktop/src/main/services/chatDatabase.ts
apps/desktop/src/main/db/chatSchema.ts
apps/desktop/src/main/db/chatDb.ts
apps/desktop/src/main/ipc/chatDbHandlers.ts
apps/desktop/src/preload/index.ts
apps/desktop/src/renderer/src/services/chatRepository.ts
apps/desktop/src/renderer/src/services/chatStreamPersistence.ts
```

### 7.1 ChatDatabaseService

`ChatDatabaseService` 位于主进程，只负责 SQLite 相关工作：

- 初始化数据库连接。
- 设置 WAL、foreign keys 等 pragma。
- 初始化 Drizzle 实例。
- 调用 Drizzle query builder 访问 chat/message/part。
- 在确实需要时封装少量 raw SQL。
- 提供事务封装。
- 实现 chat/message/part 的 CRUD。

这一层不关心 Pinia、不关心 UI 状态，也不直接处理流式节流。

### 7.2 chatDbIpcHandlers

`chatDbIpcHandlers` 位于主进程，负责注册 IPC：

```text
chatDb:chat:list
chatDb:chat:create
chatDb:chat:update
chatDb:chat:delete
chatDb:message:loadRecent
chatDb:message:loadBefore
chatDb:message:loadAll
chatDb:message:replaceAll
chatDb:message:replaceFrom
chatDb:message:append
chatDb:message:deleteAll
chatDb:message:clearAll
chatDb:message:upsert
chatDb:message:replaceParts
chatDb:message:upsertPart
chatDb:message:updateMetadata
chatDb:message:finalize
chatDb:snapshot:export
chatDb:snapshot:import
```

这一层只做参数转发、错误边界和返回值透传。业务逻辑留在 `ChatDatabaseService`。

### 7.3 chatRepository

renderer 侧 `chatRepository` 保持现有方法名和返回结构，作为兼容层保护调用方：

- store 继续调用 `loadRecentMessages`、`replaceMessages`、`appendMessages` 等旧方法。
- repository 内部改为调用 `window.api.chatDb`。
- SQLite 对 store、上下文压缩、全局搜索、备份页保持透明。

这样可以先替换持久化实现，再逐步改流式热路径，避免一次性牵动全部业务代码。

### 7.4 chatStreamPersistence

`chatStreamPersistence` 是 renderer 侧的流式专用持久化层，服务 `messageSyncController`：

```ts
upsertMessageSnapshot(chatId: string, message: BaseMessage, seqHint?: number): Promise<void>
upsertPart(messageId: string, idx: number, part: BaseMessage['parts'][number]): Promise<void>
updateMetadata(messageId: string, metadata: MetaData): Promise<void>
finalizeMessage(chatId: string, message: BaseMessage): Promise<void>
```

它不替代 `chatRepository`，只处理高频流式写入。低频场景仍走 `chatRepository.replaceMessages`。

### 7.5 ORM 使用边界

使用 Drizzle，但只作为数据库访问层：

- schema 和常规 CRUD 使用 Drizzle。
- raw SQL 只能出现在 `ChatDatabaseService` 内部。
- renderer 不接触 Drizzle。
- 不为了 ORM 再做一层通用 `BaseRepository<T>`。
- 不让 ORM 模型泄漏到 Pinia store 或组件。

不做的包装：

- 不把 `part.id` 或 `partIds` 写进 message metadata 作为业务状态。
- 不把 chat/message/part 拆成多个 renderer service。

核心边界：数据库访问只在主进程，现有调用方由 `chatRepository` 兼容，流式性能由 `chatStreamPersistence` 负责。

## 8. 写入规则

### 8.1 appendMessages

事务内执行：

1. 查询当前 `MAX(seq)`。
2. 按顺序插入每条 message。
3. 插入每条 message 的 parts。
4. 更新 `chat.message_count`、`chat.last_message_at`、`chat.last_message_preview`、`chat.updated_at`。

### 8.2 replaceMessages

事务内执行：

1. `DELETE FROM message WHERE chat_id = ?`，级联删除 parts。
2. 按数组顺序从 0 重建 seq。
3. 更新 chat 汇总字段。

### 8.3 replaceMessagesFrom

事务内执行：

1. 找到 `anchorMessageId` 对应 seq。
2. 删除 `seq >= anchorSeq` 的消息。
3. 从 `anchorSeq` 开始写入新 messages。
4. 更新 chat 汇总字段。

如果找不到 anchor，退化为 `replaceMessages(chatId, messages)`。

### 8.4 upsertMessagePart

使用 `(message_id, idx)` 做唯一键：

```ts
async function upsertMessagePart(
  messageId: string,
  idx: number,
  part: BaseMessage['parts'][number]
) {
  const now = Date.now()
  const content = JSON.stringify(part)

  await db.insert(parts)
    .values({
      messageId,
      idx,
      type: part.type,
      content,
      createdAt: now,
      updatedAt: now
    })
    .onConflictDoUpdate({
      target: [parts.messageId, parts.idx],
      set: {
        type: part.type,
        content,
        updatedAt: now
      }
    })
}
```

不要依赖自增 `part.id` 做前端缓存。业务定位使用 `messageId + idx` 更稳定。

## 9. 主进程与 preload

新增主进程数据库文件：

```text
apps/desktop/src/main/services/chatDatabase.ts
apps/desktop/src/main/db/chatSchema.ts
apps/desktop/src/main/db/chatDb.ts
```

职责：

- 初始化 SQLite 连接。
- 初始化 Drizzle。
- 维护 Drizzle schema。
- 暴露 chat/message/part CRUD。
- 提供事务封装。

可以复用现有 `better-sqlite3` 依赖，但聊天库建议独立于向量库文件：

```text
dev:  data/chat.db
prod: app.getPath('userData')/Data/SQLite/chat.db
```

preload 暴露：

```ts
window.api.chatDb = {
  chat: { list, create, update, delete },
  message: {
    loadRecent,
    loadBefore,
    loadAll,
    replaceAll,
    replaceFrom,
    append,
    deleteAll,
    clearAll,
    upsert,
    replaceParts,
    upsertPart,
    updateMetadata,
    finalize
  },
  snapshot: { export, import }
}
```

## 10. 实施步骤

### 阶段一：SQLite 持久化层

- 安装 `drizzle-orm` 和 `drizzle-kit`。
- 新增 `db/chatSchema.ts` 和 `db/chatDb.ts`。
- 新增 `chatDatabase.ts`。
- 用 Drizzle schema 建立 `chat/message/part` 表结构。
- 新增 `chatDbHandlers.ts` 并注册 IPC handlers。
- preload 暴露 `window.api.chatDb`。
- 添加主进程单元测试，覆盖 append/load/replace/delete/upsertPart。

### 阶段二：Repository 替换

- `chatRepository.ts` 改为调用 `window.api.chatDb`。
- 保持现有 repository 方法名和返回结构。
- 暂时保留 `ChatRepositorySnapshot` 结构，避免设置页备份恢复大改。

### 阶段三：Store 持久化迁出

- `initializeChatsStore` 从 SQLite 加载 `chatSummaries`。
- Pinia persist 移除 `chatSummaries`，只保留 `activeChatId/chatDrafts`。
- 所有 chat meta 修改同步调用 `chatRepository.updateChatMeta`。
- 删除聊天时调用 `chatRepository.deleteChat`，不再只删 messages key。

### 阶段四：流式细粒度写入

- 新增 `chatStreamPersistence.ts`。
- `messageSyncController` flush 时更新 UI 内存但不触发全量 persist。
- 对流式消息调用 `upsertMessagePart/updateMessageMetadata/finalizeMessage`。
- 保留 `replaceMessages` 作为编辑、删除、重试等低频慢路径。

### 阶段五：清理 IndexedDB 消息存储

- 删除 `storage/chat-serializer.ts` 的消息持久化依赖。
- 删除 `messages:{chatId}` 相关 localforage 读写。
- `initializeChatStorage` 不再处理消息 schema 清理。

## 11. 验收标准

功能：

- 新建聊天后重启应用，聊天列表和消息仍存在。
- 切换聊天、加载最近消息、向上加载历史正常。
- 删除聊天后对应 messages/parts 自动删除。
- 编辑消息、删除消息、重试、fork 聊天正常。
- 上下文压缩、全局搜索、备份导出仍能读取完整消息。

性能：

- 流式回复期间不调用 `replaceMessages(chatId, fullMessages)`。
- 单次流式 flush 只写当前 message 的 changed parts 和 metadata。
- 长聊天中流式输出不会随历史消息数量线性变慢。

数据：

- `loadAllMessages(chatId)` 还原出的 `BaseMessage[]` 与写入前结构一致。
- part 顺序由 `idx` 保证。
- `ChatSummary.messageCount/lastMessageAt/lastMessagePreview` 与消息表一致。

## 12. 不在本轮范围

- 旧 IndexedDB 聊天数据迁移。
- 多端同步协议重构。
- 草稿 `chatDrafts` 入 SQLite。
- 对 part JSON 内部做查询优化。
