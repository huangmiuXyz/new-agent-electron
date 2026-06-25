# Chat History Storage Refactor Plan

## 目标

将当前“所有会话及全部消息恢复到 Pinia 内存，并以单个 `chats` key 整包持久化”的模型，改造成“会话摘要常驻内存，消息按会话分表存储，当前会话按窗口加载，消息变更增量写入”的完整架构。

改造完成后需要达到：

- 启动时不再加载所有历史消息到内存。
- 侧边栏和聊天切换器只依赖会话摘要。
- 当前会话只加载最近消息窗口，向上滚动再加载更早消息。
- 新增、删除、修改、流式更新消息都写入消息仓储层，而不是序列化整份 `chats`。
- 发送、重试、继续生成、上下文压缩、分支会话、全局搜索、备份恢复、设备同步都通过仓储层读取所需消息。
- 不兼容旧版聊天记录。上线此改造时直接启用新 schema，旧 `chats` key 不迁移、不读取。

## 当前问题

当前核心状态在 `apps/desktop/src/renderer/src/stores/chats.ts`：

- `chats = ref<Chat[]>([])`
- `Chat.messages = BaseMessage[]`
- Pinia persist 路径为 `['chats', 'activeChatId', 'chatDrafts']`

这导致：

- IndexedDB 恢复时会把所有会话、所有消息反序列化进内存。
- 流式更新会不断替换当前会话 `messages` 数组，并触发 `chats` 整体持久化。
- `message/list.vue` 直接 `v-for` 当前会话全部消息。
- `useChat.ts` 发送前会基于当前会话全部消息构造 AI SDK chat 实例。
- 备份、同步、全局搜索等功能都默认 `chats` 内含完整消息。

## 目标架构

### 数据分层

```ts
type ChatSummary = {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  agentId?: string
  providerId?: string
  modelId?: string
  isTemp?: boolean
  parentChatId?: string
  subTask?: SubTaskInfo
  toolFeaturesEnabled?: boolean
  compressedContext?: Chat['compressedContext']
  messageCount: number
  lastMessageAt?: number
  lastMessagePreview?: string
}

type ChatMessageRecord = {
  id: string
  chatId: string
  role: BaseMessage['role']
  parts: BaseMessage['parts']
  metadata?: MetaData
  createdAt: number
  updatedAt: number
  order: number
}

type LoadedMessageWindow = {
  chatId: string
  messages: BaseMessage[]
  hasMoreBefore: boolean
  oldestOrder?: number
  newestOrder?: number
}
```

### 持久化 key

使用 localforage 继续作为底层存储，但拆分 key：

```text
chat:summaries                  ChatSummary[]
chat:active-id                  string | null
chat:drafts                     Record<string, string>
chat:messages:{chatId}          ChatMessageRecord[]
chat:schema-version             number
```

第一版可按会话存 `chat:messages:{chatId}` 数组。后续如果单会话过大，再演进到按消息 key 或分页 key：

```text
chat:messages:{chatId}:{pageNo}
chat:message:{chatId}:{messageId}
```

本次完整改造的目标是切断“所有会话消息整包持久化”，不要求一次性实现消息级 key。

## 新增模块

### `apps/desktop/src/renderer/src/services/chatRepository.ts`

职责：

- 读写会话摘要。
- 读写单个会话的消息。
- 提供分页读取、按 id 查询、按锚点截断、批量替换、导入导出。
- 屏蔽 localforage key 细节。

核心 API：

```ts
export const chatRepository = {
  async listChatSummaries(): Promise<ChatSummary[]>
  async saveChatSummaries(chats: ChatSummary[]): Promise<void>
  async getChatSummary(chatId: string): Promise<ChatSummary | null>
  async upsertChatSummary(chat: ChatSummary): Promise<void>
  async deleteChat(chatId: string): Promise<void>

  async loadRecentMessages(chatId: string, limit: number): Promise<LoadedMessageWindow>
  async loadMessagesBefore(chatId: string, beforeOrder: number, limit: number): Promise<LoadedMessageWindow>
  async loadAllMessages(chatId: string): Promise<BaseMessage[]>
  async getMessage(chatId: string, messageId: string): Promise<BaseMessage | null>
  async appendMessage(chatId: string, message: BaseMessage): Promise<void>
  async updateMessage(chatId: string, message: BaseMessage): Promise<void>
  async replaceMessages(chatId: string, messages: BaseMessage[]): Promise<void>
  async replaceMessagesFrom(chatId: string, anchorMessageId: string, messages: BaseMessage[]): Promise<void>
  async deleteMessage(chatId: string, messageId: string): Promise<void>

  async exportSnapshot(): Promise<ChatRepositorySnapshot>
  async importSnapshot(snapshot: ChatRepositorySnapshot): Promise<void>
}
```

### `apps/desktop/src/renderer/src/services/chatStorageBootstrap.ts`

职责：

- 检查 `chat:schema-version`。
- 如果没有 schema version，初始化新存储为空数据。
- 可选：删除旧版 `chats` key，防止 Pinia persist 插件误读旧结构。
- 如果 schema version 不匹配，按新版本策略重建或清空新存储；本计划不做旧聊天记录迁移。

快照类型：

```ts
type ChatRepositorySnapshot = {
  schemaVersion: 2
  summaries: ChatSummary[]
  messagesByChatId: Record<string, ChatMessageRecord[]>
  activeChatId: string | null
  chatDrafts: Record<string, string>
}
```

## Store 改造

### `stores/chats.ts`

将 `chats: Ref<Chat[]>` 改为摘要和消息窗口：

```ts
const chatSummaries = ref<ChatSummary[]>([])
const tempChats = ref<Chat[]>([])
const activeChatId = ref<string | null>(null)
const activeMessageWindow = ref<LoadedMessageWindow | null>(null)
const messageWindows = shallowRef<Record<string, LoadedMessageWindow>>({})
```

保留对外 facade，降低调用点爆炸：

```ts
const allChats = computed(() => {
  return [...chatSummaries.value.map(materializeChat), ...tempChats.value]
})

const currentChat = computed(() => {
  const summary = chatSummaries.value.find((chat) => chat.id === activeChatId.value)
  if (!summary) return tempChats.value.find((chat) => chat.id === activeChatId.value) || null
  return materializeChat(summary, getLoadedMessages(summary.id))
})
```

`materializeChat` 只为兼容现有 UI 返回 `Chat` 形状：

```ts
const materializeChat = (summary: ChatSummary, messages: BaseMessage[] = []): Chat => ({
  ...summary,
  messages
})
```

需要改成 async 的 action：

- `initializeChatsStore()`
- `setActiveChat(id)`
- `loadMoreMessagesBefore(chatId)`
- `forkChat(sourceChatId, messageId)`
- `replacePersistedState(snapshot)`

保留同步 action：

- `getChatById(id)` 返回摘要物化的 `Chat`，其 `messages` 仅为已加载窗口。
- `getRootChats()`
- `getChildChats(parentChatId)`
- `renameChat(id, title)`
- `setChatAgent(chatId, agentId)`
- `setChatModel(chatId, providerId, modelId)`
- `setChatToolFeaturesEnabled(chatId, enabled)`

消息写操作全部收口：

- `addMessageToChat`
- `deleteMessage`
- `updateMessage`
- `updateMessageMetadata`
- `updateMessages`

这些 action 必须同时更新内存窗口和 `chatRepository`。

### Pinia persist

`chats.ts` 不再使用 Pinia persist。

以下状态全部由 `chatRepository` 显式读写：

- `chatSummaries` -> `chat:summaries`
- `activeChatId` -> `chat:active-id`
- `chatDrafts` -> `chat:drafts`
- messages -> `chat:messages:{chatId}`

这样可以避免 Pinia persist 插件对聊天状态做隐式 JSON.stringify，也避免旧 `chats` key 被自动恢复。

## 消息加载流程

### 应用启动

1. `main.ts` 创建 Pinia。
2. `chats` store 初始化。
3. `initializeChatsStore()` 执行新存储 bootstrap。
4. 从 `chatRepository.listChatSummaries()` 加载摘要。
5. 解析 `activeChatId`。
6. 加载当前会话最近 `MESSAGE_WINDOW_SIZE` 条消息。

建议常量：

```ts
const MESSAGE_WINDOW_SIZE = 100
const MESSAGE_PAGE_SIZE = 50
```

### 切换会话

`setActiveChat(id)` 改为：

1. 写入 `activeChatId`。
2. 如果该会话窗口已存在，直接切换。
3. 否则调用 `chatRepository.loadRecentMessages(id, MESSAGE_WINDOW_SIZE)`。
4. 更新 `messageWindows[id]`。
5. 滚动到底部。

### 向上加载历史

`message/list.vue` 接入滚动顶部检测：

1. 当滚动接近顶部且 `hasMoreBefore` 为 true。
2. 记录当前第一条可见消息 id 和 offset。
3. 调用 `loadMoreMessagesBefore(currentChat.id)`。
4. 将更早消息 prepend 到窗口。
5. `nextTick` 后恢复滚动锚点，避免跳动。

注意：

- 保留现有 CSS `content-visibility: auto`。
- 不在第一阶段引入 JS 虚拟列表。
- `.message-item-wrapper` 不加 `contain: content`，避免破坏 scroll anchoring。

## 发送与生成链路

### `composables/useChat.ts`

当前 `getVisibleMessages()` 直接返回 `chat.messages`。改造后需要区分：

- UI 已加载窗口：`getLoadedMessages(chatId)`
- 模型上下文：`buildModelContextMessages(chatId)`

新增仓储读取：

```ts
const buildModelContextMessages = async () => {
  const runtimeChat = getChatById(chatId)
  const agent = getChatAgent()
  return chatRepository.loadContextMessages(chatId, {
    contextCount: agent?.contextCount,
    contextTokenCount: agent?.contextTokenCount,
    model: runtimeChat?.modelId
  })
}
```

如果不新增 `loadContextMessages`，也可以先在 `useChat.ts` 中：

1. `loadAllMessages(chatId)`。
2. 套用现有 contextCount/contextTokenCount/压缩逻辑。
3. 只把最终上下文传给 AI SDK。

需要改为 async 的入口：

- `sendMessages`
- `continueMessages`
- `regenerate`
- `approval`
- `retryFromToolCall`

`Input/index.vue` 的 `_sendMessage()` 已经是 async，可以继续 await `sendMessages`。

### `messageSyncController.ts`

`updateMessages(chatId, nextMessages)` 保持 facade 不变，但内部不再触发整份 `chats` 持久化。

流式更新策略：

1. 内存窗口替换最后一条 assistant message。
2. `chatRepository.updateMessage(chatId, message)` 节流写入。
3. final 时立即 flush 当前消息。
4. 更新 `ChatSummary.lastMessagePreview / lastMessageAt / messageCount`。

## 功能改造清单

### 聊天列表与切换器

文件：

- `pages/chat/sidebar.vue`
- `pages/chat/message/Input/useChatSwitcher.ts`
- `pages/chat/message/Input/ChatSwitcherPopover.vue`

改造：

- 使用 `getRootChats()`、`getChildChats()` 返回 `ChatSummary` 物化对象。
- 不依赖 `messages` 判断侧边栏内容。
- 搜索/过滤只基于标题、智能体、父子关系。

### 消息列表

文件：

- `pages/chat/message/list.vue`

改造：

- `visibleMessages` 改为 `currentChat.value?.messages || []` 兼容 facade，实际内容来自当前窗口。
- 增加顶部加载状态。
- 增加 `loadMoreMessagesBefore` 调用。
- 分支、删除、编辑仍走 store action。

### 输入框 token 统计

文件：

- `pages/chat/message/Input/useInputContextTokens.ts`

改造：

- 不再假设 `chat.messages` 是完整历史。
- 改为调用 `chatRepository.loadContextMessages` 或 store 的 `getContextMessagesForChat`。
- 统计异步化，增加 loading 状态或 debounce。

### 上下文压缩

文件：

- `services/chatService/contextCompression.ts`
- `services/chatService/middleware/compressContext.ts`

改造：

- 压缩输入从 `chat.messages` 改为 `chatRepository.loadAllMessages(chatId)` 或上下文窗口。
- 写入压缩消息时走 `updateMessages` 或 `chatRepository.appendMessage`。
- 压缩完成后更新摘要中的 `compressedContext`。

### 分支会话

文件：

- `stores/chats.ts`
- `pages/chat/message/list.vue`

改造：

- `forkChat(sourceChatId, messageId)` 必须 async。
- 从 repository 读取 source 全量消息。
- 截断到目标消息。
- 创建新 summary。
- 写入新 chat messages。
- 激活新会话并加载其最近窗口。

### 删除会话

文件：

- `stores/chats.ts`

改造：

- 删除 summary。
- 删除 `chat:messages:{chatId}`。
- 删除所有 descendant chats。
- 删除草稿和消息窗口缓存。
- 停止正在生成的消息。

### 全局搜索

文件：

- `components/GlobalSearch.vue`

改造：

- 不再遍历 `chatsStore.chats[].messages`。
- 新增 `chatRepository.searchMessages(query)`。
- 第一版可以顺序读取每个会话 messages 搜索。
- 后续可加轻量索引 `chat:search-index`。

### 备份与恢复

文件：

- `pages/settings/backup.vue`

改造：

- 导出调用 `chatRepository.exportSnapshot()`，输出新格式 `ChatRepositorySnapshot`。
- 恢复只接受新格式快照。
- 恢复后刷新 store summaries 和 active window。
- 不兼容旧备份文件中的 `{ chats: Chat[] }`。

### 设备同步

文件：

- `stores/sync.ts`
- `apps/desktop/src/main/services/sync.ts`
- `packages/types/src/electron.ts`
- `apps/desktop/src/renderer/src/types/sync.d.ts`

改造策略：

- 同步协议改为 `ChatRepositorySnapshot`。
- renderer 构造 snapshot 时调用 `chatRepository.exportSnapshot()`。
- 应用远端 snapshot 时调用 `chatRepository.importSnapshot()`。
- diff 逻辑基于 summaries 和 `messagesByChatId`，不再依赖 `Chat[]`。

### 插件 API 调整

文件：

- `services/plugins/pluginManager.ts`

风险：

- 插件可能通过 `useChatsStores()` 访问 `chats` 或 `currentChat.messages`。

改造：

- 保持 `currentChat.messages` 字段存在，但语义改为当前加载窗口。
- 插件如需完整历史，应使用新增 API。
- 在 plugin context 暴露 `getChatMessages(chatId)`。
- 不为依赖旧 `chats: Chat[]` 全量结构的插件做兼容。

## 文件改动范围

### 新增

- `apps/desktop/src/renderer/src/services/chatRepository.ts`
- `apps/desktop/src/renderer/src/services/chatStorageBootstrap.ts`
- `apps/desktop/src/renderer/src/services/chatContextMessages.ts`
- `apps/desktop/src/renderer/src/services/chatRepository.test.ts`
- `apps/desktop/src/renderer/src/services/chatStorageBootstrap.test.ts`

### 重点修改

- `apps/desktop/src/renderer/src/stores/chats.ts`
- `apps/desktop/src/renderer/src/composables/useChat.ts`
- `apps/desktop/src/renderer/src/composables/chat/messageSyncController.ts`
- `apps/desktop/src/renderer/src/pages/chat/message/list.vue`
- `apps/desktop/src/renderer/src/pages/chat/message/Input/useInputContextTokens.ts`
- `apps/desktop/src/renderer/src/services/chatService/contextCompression.ts`
- `apps/desktop/src/renderer/src/services/chatService/middleware/compressContext.ts`
- `apps/desktop/src/renderer/src/components/GlobalSearch.vue`
- `apps/desktop/src/renderer/src/pages/settings/backup.vue`
- `apps/desktop/src/renderer/src/stores/sync.ts`

### 可能需要适配

- `apps/desktop/src/renderer/src/pages/chat/index.vue`
- `apps/desktop/src/renderer/src/components/ChatMain.vue`
- `apps/desktop/src/renderer/src/pages/chat/message/Item/ai.vue`
- `apps/desktop/src/renderer/src/services/builtin-tools/tools/agent-tools.ts`
- `apps/desktop/src/renderer/src/services/builtin-tools/tools/general-tools.ts`
- `apps/desktop/src/renderer/src/services/plugins/pluginManager.ts`
- `packages/types/src/chats.ts`
- `packages/types/src/electron.ts`

## 实施阶段

### 阶段 1：仓储层与新存储初始化

1. 新增 `chatRepository.ts`。
2. 新增 `chatStorageBootstrap.ts`。
3. 为 summary/messages 转换函数写单测。
4. 实现 `chat:schema-version` 初始化。
5. 删除或忽略旧 `chats` key，不读取旧聊天记录。
6. 暂不改 UI，先验证 repository 可创建、导入、导出新格式数据。

验收：

- 空存储启动后生成 schema version。
- 旧 `chats` key 不会进入 Pinia。
- `exportSnapshot()` 输出新格式。
- 重复 bootstrap 幂等。

### 阶段 2：Store 切换到摘要 + 当前窗口

1. 改 `chats.ts` 内部状态。
2. 增加 `initializeChatsStore()`。
3. 改 `setActiveChat()` 为加载当前窗口。
4. 改所有消息 action 同步写 repository。
5. 移除 `chats.ts` 的 Pinia persist 配置。

验收：

- 启动后侧边栏显示所有历史会话。
- 只有当前会话最近消息进入 `currentChat.messages`。
- 新建、删除、重命名、切换智能体、切换模型正常。
- 刷新后数据仍在。

### 阶段 3：消息列表分页加载

1. `list.vue` 增加顶部加载更多。
2. 接入 `loadMoreMessagesBefore(chatId)`。
3. 保持滚动锚点。
4. 验证 CSS `content-visibility` 仍生效。

验收：

- 打开长会话只渲染最近窗口。
- 向上滚动可加载更早消息。
- 加载历史时滚动位置不跳。
- 流式最后一条消息正常更新。

### 阶段 4：发送、重试、继续生成

1. `useChat.ts` 引入异步上下文构造。
2. `sendMessages / continueMessages / regenerate / approval / retryFromToolCall` 改为 async。
3. `messageSyncController` 的更新保持走 store action。
4. final 时 flush 当前消息到 repository。

验收：

- 新消息发送成功。
- 继续生成、重新生成、工具审批、工具位置重试正常。
- 长会话发送时不需要把全量历史放进 Pinia。
- pending messages 队列正常。

### 阶段 5：上下文压缩和 token 统计

1. `useInputContextTokens.ts` 改为异步读取上下文消息。
2. `contextCompression.ts` 从 repository 读取完整或上下文消息。
3. 压缩消息写入 repository 并更新窗口。

验收：

- token 统计准确或与旧逻辑误差可解释。
- 自动压缩触发正常。
- 压缩上下文消息在 UI 中显示正常。

### 阶段 6：备份、恢复、同步、搜索

1. `backup.vue` 改用 `chatRepository.exportSnapshot/importSnapshot`。
2. `stores/sync.ts` 构造和应用 snapshot 时通过 repository。
3. `GlobalSearch.vue` 改为 repository 搜索。
4. 主进程 sync 类型改为新 `ChatRepositorySnapshot`。

验收：

- 导出的备份文件为新格式。
- 旧备份文件明确不支持。
- 同步 diff 和应用远端 snapshot 正常。
- 全局搜索能搜到未加载到当前窗口的历史消息。

### 阶段 7：清理直接写入

1. 全仓搜索 `chat.messages =`、`.messages.push`、`.messages.splice`。
2. 改为 store action 或 repository API。
3. 对 `getChatById(id).messages` 的使用逐个判定是否需要完整历史。
4. 给高风险路径加测试。

验收：

- 外部模块不直接修改 `chat.messages`。
- `currentChat.messages` 只作为 UI 当前窗口使用。
- 完整历史读取都通过 repository。

## 测试计划

### 单元测试

- `chatRepository`：
  - summary CRUD
  - message append/update/delete
  - recent messages pagination
  - load before pagination
  - replace from anchor
  - export/import snapshot

- `chatStorageBootstrap`：
  - 空存储初始化
  - schema version 写入
  - 旧 `chats` key 清理或忽略
  - 重复 bootstrap 幂等

- `chats store`：
  - 初始化摘要
  - 切换会话加载窗口
  - updateMessages 同步窗口和 repository
  - deleteChat 删除 descendant
  - forkChat async 分支

### 手动回归

- 老版本数据启动后不迁移，应用使用新空存储。
- 新建会话发送第一条消息。
- 长会话切换、滚动加载历史、继续生成。
- 编辑消息、删除消息、重新生成。
- 创建分支、创建分支并继续。
- 工具审批和工具位置重试。
- 自动上下文压缩。
- 全局搜索历史消息。
- 新格式备份导出、清空、恢复。
- 设备同步发送和接收 snapshot。
- 临时会话不被持久化。

### 性能验收

准备测试数据：

- 500 个会话。
- 每个会话 100 条消息。
- 其中 10 个会话含大型 tool result。

指标：

- 启动后 Pinia 中不含所有历史 messages。
- 初始恢复不执行旧 `chats` 整包 JSON parse。
- 切换普通会话加载时间小于 200ms。
- 打开长会话只加载最近 100 条。
- 流式输出期间不写入完整 `chats` key。
- 内存占用随“已加载会话窗口”增长，而不是随“全部历史消息”增长。

## 风险与处理

### 异步边界增加

风险：原先同步函数变 async 后调用点漏 await。

处理：

- TypeScript 显式返回 `Promise`。
- 发送链路和 UI 事件统一 await。
- 对无需等待的场景使用 `void` 并明确注释。

### 插件破坏性变更

风险：插件读取 `currentChat.messages` 以为是完整历史。

处理：

- 保持字段存在，但语义改为当前窗口。
- 提供 `getChatMessages(chatId)`。
- 在插件开发文档补充说明。
- 不兼容依赖旧全量结构的插件。

### 滚动跳动

风险：prepend 历史消息导致 scrollTop 跳变。

处理：

- 加载前记录第一条可见消息 DOM。
- 加载后用 DOM offset 差补偿。
- 继续依赖现有 `content-visibility: auto`，不引入会破坏锚定的 contain。

## 完成定义

- `chats` store 不再持久化完整 `Chat[]`。
- 应用启动不再把所有历史消息加载到 Pinia。
- 当前聊天 UI 支持向上加载历史。
- 所有消息新增、修改、删除、流式更新都通过 repository 增量持久化。
- 备份、恢复、同步、搜索能覆盖未加载窗口中的历史消息。
- 旧聊天记录不会被迁移或读取。
- `pnpm --filter desktop typecheck` 通过。
- 相关单测通过。
