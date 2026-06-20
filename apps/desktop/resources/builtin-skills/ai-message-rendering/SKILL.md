---
name: ai-message-rendering
description: 描述 AI 聊天消息的完整渲染链路，包括数据流、组件树、流式渲染、Markdown 增量解析、语法高亮、消息分片架构。适用于修改或调试 AI 消息展示相关的功能。
enabled: true
metadata:
  category: rendering
  scope: chat
---

# AI 聊天消息渲染链路

## 数据流总览

```
LLM API Stream
    │
    ▼
chatService/index.ts ── createAgent() → ToolLoopAgent.stream()
    │  middleware 管线:
    │    extractReasoningMiddleware    (提取 <think> 推理块)
    │    createUsageGuardMiddleware    (用量限制)
    │    createToolMiddleware          (工具调用)
    │    createTextFileMiddleware      (文本文件)
    │    createCompressContextMiddleware (上下文压缩)
    │    createContextLimitMiddleware   (上下文长度限制)
    │    createRagMiddleware           (RAG 检索)
    │    createSkillReferenceMiddleware (@skill 提及注入)
    │
    ▼
useChat.ts ── 中央编排器
    │  - 创建 _useChat (AI SDK Vue)
    │  - transport.sendMessages() → service.createAgent()
    │  - 监听 chat.lastMessage 变化
    │  - 处理重试逻辑 (retry/regenerate/continue)
    │
    ▼
messageSyncController.ts ── 流批处理引擎
    │  - scheduleStreamingUpdate() 缓存 token
    │  - flushStreamingUpdate() 每 500ms 批量刷新到 store
    │  - createStoreMessageSnapshot() 构建快照 + token 用量估算
    │
    ▼
chats.ts (Pinia store) ── 响应式状态
    │  - chat.messages 数组
    │  - visibleMessages 计算属性
    │
    ▼
list.vue ── 消息列表
    │  - v-for 遍历 visibleMessages
    │  - 按 role 分发到不同 Item 组件
    │
    ▼
Item/ai.vue / human.vue / system.vue
    │
    ▼
content.vue ── 核心内容分发器
    │  - 遍历 message.parts
    │  - 按 part 类型分发到对应渲染器
    │
    ▼
Markdown.vue ── 流式 Markdown (增量渲染)
    │  - useIncremark() ← @incremark/vue
    │  - requestAnimationFrame 批量追加文本
    │  - 完成后 finalizeFromFullText()
    │  - 流式光标闪烁
    │
    ▼
IncremarkRenderer.vue ── Incremark + ThemeProvider
    │
    ▼
@incremark/core + shiki ── 增量 Markdown 解析 + 语法高亮
    │
    ▼
CustomCodeBlock.vue ── 代码块 (html/htm)
    └─ lowlight (highlight.js) 延迟高亮
```

## 组件渲染树

```
chat/index.vue
  └─ ChatMain
       └─ message/list.vue
            └─ AutoScrollContainer
                 └─ v-for: message-item-wrapper
                      │
                      ├─ [role=user] ChatMessageItemHuman
                      │    └─ ChatMessageItemContent
                      │         ├─ [text part] 纯文本 div
                      │         └─ [file part] FileUpload / AudioInputPreview
                      │
                      ├─ [role=assistant] ChatMessageItemAi
                      │    ├─ ChatMessageItemRagSearch
                      │    ├─ Loading dots / Retry state
                      │    ├─ ChatMessageItemContent (markdown=true, streaming)
                      │    │    ├─ [text part] Markdown.vue
                      │    │    │    └─ IncremarkRenderer
                      │    │    │         └─ ThemeProvider
                      │    │    │              └─ Incremark
                      │    │    │                   ├─ shiki (代码块高亮)
                      │    │    │                   └─ CustomCodeBlock (html/htm)
                      │    │    ├─ [reasoning] ChatMessageItemReasoning_content
                      │    │    │    └─ VirtualParagraphText (虚拟长文本)
                      │    │    ├─ [dynamic-tool] ChatMessageItemDynamicTool
                      │    │    │    └─ 自定义组件分发 + VirtualParagraphText
                      │    │    ├─ [tool-*] ChatMessageItemTool
                      │    │    │    ├─ ChatMessageItemSuggestions
                      │    │    │    ├─ ChatMessageItemExecCommand
                      │    │    │    └─ ChatMessageItemDynamicTool
                      │    │    └─ ChatMessageItemError
                      │    └─ MessageTranslation
                      │
                      └─ [role=system] ChatMessageItemSystem
                           └─ 可折叠系统卡片
```

## 消息分片架构 (Message Parts)

消息使用 AI SDK 的 `UIPart` 类型系统，content.vue 根据 part 类型分发：

| Part 类型 | 渲染组件 | 说明 |
|-----------|----------|------|
| `TextUIPart` | Markdown.vue / 纯文本 | 文本内容，AI 消息走 Markdown 流式渲染 |
| `ToolUIPart` | ChatMessageItemTool | 工具调用及结果 |
| `FileUIPart` | FileUpload / AudioInputPreview | 文件附件 |
| `DynamicToolUIPart` | ChatMessageItemDynamicTool | 动态渲染的自定义工具 |
| `reasoning` | ChatMessageItemReasoning_content | 推理/思考过程 (从 <think> 提取) |
| `step-start` | 被 messageParts.ts 过滤掉 | 步骤边界标记 |

工具函数定义在 `messageParts.ts`:
- `getRenderableMessageParts()` — 过滤 `step-start` 后的可渲染 parts
- `getCollapsedMessageParts()` — 用于收起历史对话时的摘要显示

## 关键文件索引

### 页面与布局
| 文件 | 职责 |
|------|------|
| `pages/chat/index.vue` | 聊天主页，注册快捷键，提供 useChat hook |
| `pages/chat/list.vue` | 消息列表，v-for 渲染 + 编辑/复制/右键菜单/入场动画 |
| `pages/chat/message/Nav.vue` | 消息导航栏（跳转上/下/首/尾） |

### 消息 Item 组件
| 文件 | 职责 |
|------|------|
| `pages/chat/message/Item/ai.vue` | AI 消息：头像、模型名、token 用量、流式加载点、重试 UI、RAG 状态 |
| `pages/chat/message/Item/human.vue` | 用户消息：聊天气泡 |
| `pages/chat/message/Item/system.vue` | 系统消息：可折叠卡片 |
| `pages/chat/message/Item/content.vue` | **核心分发器**：遍历 parts，按类型路由渲染 |
| `pages/chat/message/Item/reasoning_content.vue` | 推理过程块：可折叠 + VirtualParagraphText |
| `pages/chat/message/Item/tool.vue` | 工具调用分发器 |
| `pages/chat/message/Item/dynamic-tool.vue` | 通用工具调用 UI：可折叠，输入/输出，内联编辑，审批按钮 |
| `pages/chat/message/Item/error.vue` | 错误展示 + 重试按钮 |
| `pages/chat/message/Item/suggestions.vue` | AI 建议回复 |
| `pages/chat/message/Item/execCommand.vue` | 命令执行渲染器 |
| `pages/chat/message/Item/rag-search.vue` | RAG 检索状态 |
| `pages/chat/message/Item/messageParts.ts` | 工具函数：过滤/折叠 parts |

### Markdown & 代码渲染
| 文件 | 职责 |
|------|------|
| `components/Markdown.vue` | **流式 Markdown 渲染器**：useIncremark，requestAnimationFrame 批量追加，完成后 finalizeFromFullText，流式光标 |
| `components/IncremarkRenderer.vue` | 封装 @incremark/vue 的 Incremark + ThemeProvider |
| `components/CustomCodeBlock.vue` | 代码块 (html/htm)：lowlight 延迟高亮，复制/预览/打开浏览器 |
| `components/customCodeBlockCompletion.ts` | Injection key：通知代码块流完成 |

### Composables (业务逻辑)
| 文件 | 职责 |
|------|------|
| `composables/useChat.ts` | **中央编排器**：创建 AI SDK useChat，发送消息，重试，语音，子任务 |
| `composables/chat/messageSyncController.ts` | **流批处理引擎**：500ms 批量刷新到 Pinia store |
| `composables/chat/speechStreamController.ts` | TTS 语音流协调 |
| `composables/chat/subTaskResultCoordinator.ts` | 子代理任务结果管理 |
| `composables/chat/sentenceSegmenter.ts` | 句子分割 (用于音频流) |
| `composables/useMessageScroll.ts` | 滚动管理：滚动到消息 / 底部 |
| `composables/useParagraphVirtualText.ts` | 虚拟长文本：分段 + 高度估算 |

### 服务层
| 文件 | 职责 |
|------|------|
| `services/chatService/index.ts` | **核心服务**：createAgent() 构建 middleware 管线，启动 stream |
| `services/chatService/generation.ts` | 封装 AI SDK streamText / generateText 等 |
| `services/chatService/tokenUsage.ts` | js-tiktoken token 用量估算 |
| `services/chatService/middleware/*` | middleware 管线 (rag / contextLimit / compressContext / usageGuard / skillReferences / textFiles / tools) |

### 状态管理
| 文件 | 职责 |
|------|------|
| `stores/chats.ts` | Pinia store：Chat CRUD, Message CRUD, Pending message, Fork/Branch |

## 关键实现模式

### 1. 流式 Markdown 增量渲染 (Markdown.vue)
- `useIncremark()` 来自 `@incremark/vue`，支持增量解析不完整 Markdown
- `scheduleAppend()` / `flushPendingChunk()` 通过 `requestAnimationFrame` 批量追加，避免布局抖动
- 流完成后 120ms 延迟调用 `finalizeFromFullText()` 从全文重新解析，确保结构完整
- 流式光标：`.markdown-stream-caret` 用 `requestAnimationFrame` 追踪末尾位置

### 2. 流批处理 (messageSyncController.ts)
- 每 500ms 批量刷新，而非每个 token 都更新 store
- `createStoreMessageSnapshot()` 构建完整快照 + token 用量估算
- 避免 Pinia 持久化 (IndexedDB, 2s 防抖) 和 Vue 响应式被频繁触发

### 3. 语法高亮
- **标准代码块**：`@incremark/core` 使用 `shiki` (v3.20.0) + `shiki-stream` (流式高亮)
- **HTML/HTM 代码块**：`CustomCodeBlock.vue` 使用 `lowlight` (highlight.js) → 流中纯文本渲染，完成后 `requestIdleCallback` 触发高亮，超 30k 字符跳过高亮

### 4. 推理块提取
- `createAgent()` 中注入 `extractReasoningMiddleware`，从 AI 输出中提取 `<think>...</think>` 标签
- 提取的内容作为 `reasoning` 类型的 part，渲染为可折叠的推理过程块

### 5. 自动重试
- 流失败时根据 `retryIntervalMs` 调度自动重试
- UI 显示倒计时和「停止重试」按钮
- 状态存储在 message metadata (retrying / retryAttempt / retryCountdownEndsAt)

### 6. 虚拟长文本 (VirtualParagraphText)
- 用于 reasoning_content 和 dynamic-tool 的大段文本输出
- 将文本按段落拆分，使用虚拟列表渲染，避免大量 DOM 节点
- `useParagraphVirtualText` 提供高度估算和滚动定位

## 常见修改场景

- **修改消息气泡样式** → `Item/ai.vue` / `Item/human.vue`
- **调整 Markdown 渲染行为** → `Markdown.vue`
- **添加新的 part 类型** → `content.vue` 的模板分发 + 创建对应 Item 组件
- **修改流刷新频率** → `messageSyncController.ts` 的 `STREAM_SYNC_INTERVAL_MS`
- **更换语法高亮引擎** → `IncremarkRenderer.vue` / `CustomCodeBlock.vue`
- **调整推理块行为** → `middleware/` 中的 `extractReasoningMiddleware`
