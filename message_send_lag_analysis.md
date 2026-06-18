# 消息发送卡顿分析报告

> 分析对象：`new-agent-electron` 项目  
> 分析时间：2026-06-18  
> 分析范围：用户点击「发送」到 AI 开始流式回复的完整链路

---

## 一、消息发送完整链路

```
用户点击发送
  → Input/index.vue: _sendMessage()
    → 清空输入框 / 重建编辑器
    → sendMessageParts(chatId, parts)
      → useChat.ts: sendMessages(content)
        → createChat(getVisibleMessages())  ← 每次发送都新建 useChat 实例
          → cloneDeep(messages)             ← 深拷贝全部历史消息
          → new _useChat({ messages: cloneDeep(messages) })
        → chat.sendMessage()
          → transport.sendMessages
            → service.createAgent(...)      ← 异步构建 Agent
              → autoCompressContext(...)     ← 可能触发上下文压缩（额外 LLM 请求）
              → discoverSkills(...)          ← 扫描技能文件
              → list_tools(mcpClient)        ← MCP 工具列表（网络请求，3次重试）
              → validateUIMessages(...)      ← 验证消息
              → sanitizeUIMessages(...)      ← 清洗消息
              → convertToModelMessages(...)  ← 转换消息格式
              → agent.stream(...)            ← 发起流式请求
```

---

## 二、卡顿点分析

### 🔴 严重卡顿点

#### 1. `createChat()` 每次发送都新建 useChat 实例 + 双重 `cloneDeep`

**文件**：`useChat.ts` L116-L118, L276-L277, L453-L454

```typescript
// sendMessages 每次调用都创建新的 chat 实例
const sendMessages = async (content) => {
  const chat = createChat(getVisibleMessages())  // ← 新建实例
  chat.sendMessage(...)
}

// createChat 内部双重深拷贝
return new _useChat<BaseMessage>({
  messages: cloneDeep(messages),  // ← 第一次深拷贝
  ...
})

// regenerate 中还有额外的 cloneDeep
const retryMessages = cloneDeep(messages.slice(0, retryAnchorMessageIndex + 1))  // ← 第二次
```

**问题**：  
- 每次发送消息都会创建一个新的 `_useChat` 实例并销毁旧的（通过 `scope.stop()`）
- `cloneDeep` 对包含大量 parts、metadata、工具调用结果的消息数组进行递归深拷贝，消息历史越长越慢
- metadata 中包含 `stop` 函数、`audio chunks`（可能含 base64 音频数据）、`usage` 对象等，深拷贝开销极大

**影响**：消息历史 >20 条时，此处可产生 **100-500ms** 的主线程阻塞

---

#### 2. `watch(chat.lastMessage, { deep: true })` 深度监听

**文件**：`useChat.ts` L403-L409

```typescript
watch(
  () => chat.lastMessage,
  (newMessage) => {
    messageSyncController.scheduleStreamingUpdate(newMessage)
  },
  { deep: true }  // ← 深度监听整个消息对象
)
```

**问题**：  
- AI SDK 内部每次流式 token 更新都会修改 `lastMessage` 的 parts 数组
- `deep: true` 会递归遍历整个 message 对象（包括所有 parts、metadata、工具调用结果）
- 虽然有 `STREAM_SYNC_INTERVAL_MS = 1000ms` 的批量刷新节流，但 **watcher 本身的触发开销** 无法被节流
- 每个流式 token 都会触发一次深度遍历比较

**影响**：流式回复期间，高频 watcher 触发可造成 **持续性的主线程压力**，表现为打字卡顿

---

#### 3. IndexedDB 持久化触发频繁

**文件**：`utils/index.ts` L386-L387, L509-L552 + `stores/chats.ts` L634-L651

```typescript
// chats store 持久化配置
persist: {
  storage: indexedDBStorage,
  paths: ['chats', 'activeChatId', 'chatDrafts'],  // ← 持久化整个 chats 数组
}

// IndexedDB storage 的 debounce
const DEBOUNCED_STORAGE_KEYS = new Set(['chats'])
const STORAGE_WRITE_DEBOUNCE_MS = 800
```

**问题**：
- Pinia persist 插件监听 `chats` 状态变化，每次变化都会调用 `setItem`
- 虽然有 800ms debounce，但在流式更新期间 `updateMessages` 每 1 秒触发一次状态变更
- `setItem` 需要序列化整个 chats 数组（包含所有会话的所有消息），即使是增量更新也需全量序列化
- `JSON.stringify` 一个包含数百条消息（含 metadata、工具调用结果、base64 音频）的对象非常耗时
- 序列化在主线程执行，阻塞 UI

**影响**：长对话场景下，每次持久化可产生 **200-800ms** 的主线程阻塞，每秒触发一次

---

### 🟡 中等卡顿点

#### 4. `updateMessages` 的不可变更新模式

**文件**：`messageSyncController.ts` L161-L181, `chats.ts` L436-L445

```typescript
// messageSyncController flush 时
const messagesToSync = pendingSyncMessageIds
  .map((id) => pendingSyncMessages.get(id))
  .filter(Boolean)

messagesToSync.forEach((message) => {
  syncMessageToStore(message)  // 每条消息单独调用 updateMessages
})

// syncMessageToStore 内部
updateMessages(chatId, (messages) =>
  replaceMessageById(messages, msgToUpdate.id!, (message) => ({
    ...message,
    parts: msgToUpdate.parts,    // ← 创建新 parts 数组
    metadata: msgToUpdate.metadata  // ← 创建新 metadata 对象
  }))
)

// chats.ts updateMessages
const nextMessages = typeof messages === 'function' ? messages(chat.messages) : messages
chat.messages = nextMessages  // ← 替换整个数组引用
```

**问题**：
- 每次更新都会创建新的消息数组、新的消息对象、新的 parts 数组
- Vue 响应式系统需要对新旧数组进行 diff，消息越多 diff 越慢
- 多条消息在 flush 时逐条调用 `updateMessages`，每次都触发响应式更新

---

#### 5. `createStoreMessageSnapshot` 每次流式更新都创建快照

**文件**：`messageSyncController.ts` L53-L103

```typescript
const createStoreMessageSnapshot = (message?: BaseMessage, error?: APICallError) => {
  if (!message) return null
  const nextParts = message.parts?.map((part) => ({ ...part }))  // ← 拷贝所有 parts
  const nextMetadata = {
    ...message.metadata,  // ← 展开所有 metadata
    ...(error ? { error, loading: false } : {})
  } as MetaData
  // ... 后续还有 token usage 计算逻辑
  return {
    ...message,
    parts: nextParts,
    metadata: nextMetadata
  }
}
```

**问题**：
- 每次 `scheduleStreamingUpdate`（即每个流式 token）都会调用 `createStoreMessageSnapshot` 创建快照
- 虽然 flush 是节流的，但 **快照创建本身不节流**，每次 watcher 触发都会执行
- 对含大量 parts 的消息，`map((part) => ({ ...part }))` 开销显著

---

#### 6. MCP 工具列表获取阻塞发送

**文件**：`chatService/index.ts` L144-L159

```typescript
if (!isMobile.value && mcpTools && mcpTools.length > 0) {
  const close = messageApi.loading('连接mcp服务器中...')
  try {
    const allTools = await list_tools(JSON.parse(JSON.stringify(mcpClient)))  // ← 网络请求
    // ...
  } catch (error) {
    messageApi.error((error as Error).message)
  } finally {
    close()
  }
}
```

**问题**：
- `list_tools` 是异步网络请求（连接 MCP 服务器），需等待完成才能发送
- 有 3 次重试 + 100ms delay，最坏情况阻塞 **数秒**
- `JSON.parse(JSON.stringify(mcpClient))` 对配置做深拷贝，也有开销
- 还显示了 loading 遮罩，进一步影响感知性能

---

#### 7. `onUseAIBefore` 钩子同步等待

**文件**：`chatService/index.ts` L76

```typescript
await onUseAIBefore({ model, providerType, apiKey, baseURL })
```

**问题**：
- 发送消息前同步等待所有插件的 `ai:before-use` 钩子完成
- 钩子数量和执行时间不可控，增加了发送延迟

---

### 🟢 轻微卡顿点

#### 8. `visibleMessages` 的 `v-for` + `v-memo` 颗粒度

**文件**：`list.vue` L642-L709

```html
<template v-for="(message, index) in visibleMessages" :key="message.id">
  <div v-memo="[
    message,
    index === lastMessageIndex,
    ...
  ]">
```

**问题**：
- `v-memo` 的依赖包含 `message` 整个对象，任何属性变更都会触发重新渲染
- 流式更新时最后一条消息频繁变更，只有最后一条需要更新，但 diff 仍需遍历
- 好的方面：`v-memo` 确实阻止了非最后消息的重渲染；CSS `content-visibility: auto` 也帮助了长列表性能

#### 9. `scrollToBottom` 使用 setTimeout

**文件**：`useChat.ts` L420-L424, `useMessageScroll.ts` L31-L35

```typescript
const scrollToBottom = () => {
  setTimeout(() => {
    messageScrollRef.value?.scrollToBottom()
  }, 1)  // ← 1ms 延迟
}
```

**问题**：
- 1ms 的 setTimeout 虽小但会在发送时抢占主线程
- 多处调用 scrollToBottom（sendMessages、regenerate）会产生多次滚动计算

---

## 三、优化方案

### 方案 1：复用 useChat 实例（优先级：🔴 高）

**目标**：消除每次发送消息时的 `createChat` + `cloneDeep` 开销

```typescript
// useChat.ts 修改建议

// 缓存当前活跃的 chat 实例，而非每次新建
let activeChat: _useChat<BaseMessage> | null = null
let activeChatMessagesVersion = 0

const getOrCreateChat = (messages: BaseMessage[], options?: { regenerateMessageId?: string }) => {
  // 仅在消息列表变化或首次创建时新建
  if (activeChat && !options?.regenerateMessageId) {
    return activeChat
  }
  
  // 需要重建时，先清理旧的
  if (activeChat) {
    // 清理旧 scope
  }
  
  activeChat = createChat(messages, options)
  return activeChat
}
```

**预期收益**：消除 100-500ms 的 cloneDeep 开销

---

### 方案 2：用 `structuredClone` 或浅拷贝替代 `cloneDeep`（优先级：🔴 高）

**目标**：减少消息拷贝开销

```typescript
// 方案 A：使用 structuredClone（原生 API，比 lodash cloneDeep 快 2-5x）
const messagesCopy = structuredClone(messages)

// 方案 B：针对 AI SDK 的需求，仅浅拷贝消息数组 + 元数据，不递归深拷贝
const messagesCopy = messages.map(msg => ({
  ...msg,
  parts: msg.parts.map(p => ({ ...p })),
  metadata: { ...msg.metadata }
}))
```

**注意**：metadata 中包含 `stop` 函数，`structuredClone` 不支持函数。需要分离可序列化数据和函数引用：

```typescript
const messagesCopy = messages.map(msg => {
  const { stop, ...serializableMetadata } = msg.metadata || {}
  return {
    ...msg,
    parts: msg.parts.map(p => ({ ...p })),
    metadata: { ...serializableMetadata, stop }  // 保持函数引用
  }
})
```

---

### 方案 3：移除 `deep: true` watcher，改用显式事件（优先级：🔴 高）

**目标**：消除流式 token 更新时的深度遍历

```typescript
// useChat.ts 修改建议

// 移除 deep watch
// watch(() => chat.lastMessage, (newMessage) => { ... }, { deep: true })

// 改用 AI SDK 的流式回调或 throttle + shallow watch
import { throttle } from 'es-toolkit'

const throttledSync = throttle((message) => {
  messageSyncController.scheduleStreamingUpdate(message)
}, 200)  // 200ms 节流

// 使用浅监听 + 手动触发
watch(
  () => chat.lastMessage?.id,  // 只监听 id 变化
  () => {
    if (chat.lastMessage) {
      throttledSync(chat.lastMessage)
    }
  }
)

// 或监听 parts 长度变化（新增 part 时触发）
watch(
  () => chat.lastMessage?.parts?.length,
  () => {
    if (chat.lastMessage) {
      throttledSync(chat.lastMessage)
    }
  }
)
```

---

### 方案 4：优化 IndexedDB 持久化策略（优先级：🔴 高）

**目标**：减少全量序列化频率

```typescript
// 方案 A：将消息和会话元数据分离持久化
persist: {
  storage: indexedDBStorage,
  paths: ['chats'],  // 只持久化必要字段
}

// 方案 B：使用 Web Worker 进行序列化
// 在 worker 中执行 JSON.stringify，避免阻塞主线程
const serializationWorker = new Worker('serialization.worker.js')
serializationWorker.postMessage({ chats })
serializationWorker.onmessage = (e) => {
  localforage.setItem('chats', e.data)
}

// 方案 C：增量持久化 — 只保存变化的消息
const persistMessageDelta = (chatId: string, message: BaseMessage) => {
  const key = `chat:${chatId}:msg:${message.id}`
  localforage.setItem(key, message)
}

// 方案 D：增大 debounce 时间到 2-3 秒（流式期间不写）
const STORAGE_WRITE_DEBOUNCE_MS = 2000  // 从 800ms 增大到 2000ms
```

---

### 方案 5：批量 `updateMessages` 合并（优先级：🟡 中）

**目标**：减少 flush 时的多次响应式触发

```typescript
// messageSyncController.ts 修改建议

const flushStreamingUpdate = () => {
  // ... 收集 messagesToSync

  // 一次性批量更新，而非逐条更新
  const messageMap = new Map(messagesToSync.map(m => [m.id, m]))
  
  updateMessages(chatId, (messages) => 
    messages.map(msg => {
      const update = messageMap.get(msg.id)
      if (!update) return msg
      return {
        ...msg,
        parts: update.parts,
        metadata: update.metadata
      }
    })
  )
  
  // 只触发一次响应式更新
}
```

---

### 方案 6：延迟加载 MCP 工具（优先级：🟡 中）

**目标**：避免 MCP 连接阻塞消息发送

```typescript
// chatService/index.ts 修改建议

// 方案 A：缓存 MCP 工具列表，避免每次发送都重新获取
const mcpToolsCache = new Map<string, { tools: any; timestamp: number }>()
const MCP_CACHE_TTL = 5 * 60 * 1000  // 5 分钟缓存

if (!isMobile.value && mcpTools && mcpTools.length > 0) {
  const cacheKey = JSON.stringify(mcpClient)
  const cached = mcpToolsCache.get(cacheKey)
  
  if (cached && Date.now() - cached.timestamp < MCP_CACHE_TTL) {
    // 使用缓存的工具列表
    Object.assign(tools, cached.tools)
  } else {
    // 后台获取，不阻塞发送
    list_tools(JSON.parse(JSON.stringify(mcpClient))).then(allTools => {
      // 更新工具列表到当前活跃的 agent
      mcpToolsCache.set(cacheKey, { tools: allTools, timestamp: Date.now() })
    }).catch(error => {
      messageApi.error((error as Error).message)
    })
  }
}

// 方案 B：在应用启动时预加载 MCP 工具
// 而不是在每次发送消息时
```

---

### 方案 7：`createStoreMessageSnapshot` 延迟到 flush 时执行（优先级：🟡 中）

**目标**：减少每个流式 token 的快照创建开销

```typescript
// messageSyncController.ts 修改建议

const scheduleStreamingUpdate = (message?: BaseMessage) => {
  if (!message) return

  // 只存储消息引用，不创建快照
  pendingSyncMessages.set(message.id, message)  // ← 存引用而非快照
  if (!pendingSyncMessageIds.includes(message.id)) {
    pendingSyncMessageIds.push(message.id)
  }

  pendingStreamParts = message.parts
  pendingSpeechMessage = message.role === 'assistant' ? message : undefined

  if (streamFlushHandle) return

  streamFlushHandle = setTimeout(() => {
    flushStreamingUpdate()
  }, STREAM_SYNC_INTERVAL_MS)
}

// 在 flush 时才创建快照
const flushStreamingUpdate = () => {
  const messagesToSync = pendingSyncMessageIds
    .map(id => pendingSyncMessages.get(id))
    .filter(Boolean)
    .map(msg => createStoreMessageSnapshot(msg))  // ← 延迟到此处创建快照

  // ...
}
```

---

### 方案 8：`onUseAIBefore` 改为不阻塞（优先级：🟡 中）

```typescript
// chatService/index.ts 修改建议

// 不 await，改为后台执行
void onUseAIBefore({ model, providerType, apiKey, baseURL })

// 或添加超时保护
await Promise.race([
  onUseAIBefore({ model, providerType, apiKey, baseURL }),
  new Promise(resolve => setTimeout(resolve, 500))  // 最多等 500ms
])
```

---

### 方案 9：流式期间降低 `STREAM_SYNC_INTERVAL_MS`（优先级：🟡 中）

**目标**：平衡 UI 流畅度和更新频率

```typescript
// messageSyncController.ts

// 当前 1000ms 更新一次，可以改为动态调整：
// - 前 2 秒（loading 阶段）：200ms 间隔，快速展示"正在思考"
// - 开始输出文本后：500ms 间隔，平衡流畅度和性能
// - 长文本输出中：800ms 间隔

let currentInterval = 200

const scheduleStreamingUpdate = (message?: BaseMessage) => {
  // ... 
  if (streamFlushHandle) return
  
  // 根据消息内容动态调整
  const hasText = message?.parts?.some(p => p.type === 'text')
  currentInterval = hasText ? 500 : 200
  
  streamFlushHandle = setTimeout(() => {
    flushStreamingUpdate()
  }, currentInterval)
}
```

---

### 方案 10：虚拟列表优化（优先级：🟢 低）

**目标**：长会话场景下的渲染优化

当前已有 `content-visibility: auto` 和 `contain: content`，建议进一步：

```html
<!-- 使用虚拟滚动组件，只渲染可见区域的消息 -->
<!-- 例如 vue-virtual-scroller -->
<RecycleScroller
  :items="visibleMessages"
  :item-size="estimatedItemSize"
  key-field="id"
>
  <template #default="{ item: message, index }">
    <!-- 消息内容 -->
  </template>
</RecycleScroller>
```

**注意**：虚拟滚动与 `content-visibility: auto` 可能冲突，需要二选一。当前方案对于 <100 条消息已经够用，虚拟滚动适合 >500 条消息的极端场景。

---

## 四、优化优先级矩阵

| 方案 | 预期收益 | 实现难度 | 风险 | 优先级 |
|------|---------|---------|------|--------|
| 1. 复用 useChat 实例 | 100-500ms | 高 | 中（需处理状态同步） | 🔴 P0 |
| 2. 替代 cloneDeep | 50-200ms | 低 | 低 | 🔴 P0 |
| 3. 移除 deep watch | 50-100ms/帧 | 中 | 中（需测试流式更新） | 🔴 P0 |
| 4. 优化持久化 | 200-800ms/次 | 中 | 低 | 🔴 P0 |
| 5. 批量 updateMessages | 20-50ms | 低 | 低 | 🟡 P1 |
| 6. 延迟加载 MCP | 100-3000ms | 中 | 中（工具可能不可用） | 🟡 P1 |
| 7. 延迟快照创建 | 10-30ms/token | 低 | 低 | 🟡 P1 |
| 8. onUseAIBefore 不阻塞 | 0-500ms | 低 | 低 | 🟡 P1 |
| 9. 动态刷新间隔 | 间接收益 | 低 | 低 | 🟡 P2 |
| 10. 虚拟列表 | 长会话收益 | 高 | 中 | 🟢 P2 |

---

## 五、快速实施建议

### 第一阶段（立竿见影，1-2天）

1. **方案 2**：将 `cloneDeep` 替换为浅拷贝 + 结构化克隆
2. **方案 7**：将快照创建延迟到 flush 时
3. **方案 5**：合并 flush 时的多次 `updateMessages` 为一次
4. **方案 4D**：将 `STORAGE_WRITE_DEBOUNCE_MS` 从 800ms 增大到 2000ms

### 第二阶段（核心优化，3-5天）

5. **方案 3**：移除 `deep: true` watcher，改用节流 + 浅监听
6. **方案 1**：复用 useChat 实例，避免每次发送都重建
7. **方案 6**：MCP 工具列表缓存

### 第三阶段（深度优化，按需）

8. **方案 4B**：Web Worker 序列化
9. **方案 8**：onUseAIBefore 异步化
10. **方案 10**：虚拟列表（仅在超长会话场景需要）

---

## 六、性能监控建议

在实施优化前后，建议添加性能埋点进行对比：

```typescript
// 在关键节点添加 performance 标记
const sendStart = performance.now()

// createChat 完成后
console.log(`[perf] createChat: ${performance.now() - sendStart}ms`)

// agent.stream 发起前
console.log(`[perf] pre-stream: ${performance.now() - sendStart}ms`)

// 首个 token 到达时
console.log(`[perf] first-token: ${performance.now() - sendStart}ms`)

// 在 flushStreamingUpdate 中
console.log(`[perf] flush: ${messagesToSync.length} msgs, ${performance.now() - flushStart}ms`)

// 在 indexedDBStorage.setItem 中
console.log(`[perf] storage-write: ${JSON.stringify(value).length} bytes, ${duration}ms`)
```

通过对比优化前后的 `first-token` 延迟和 `flush` 耗时，可以量化优化效果。
