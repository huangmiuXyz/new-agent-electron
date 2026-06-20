---
name: agent-qi-app-dev-zh
description: 面向 Agent-Qi / agent-qi-electron 聊天输入框（Input/index.vue）的开发指南。涉及聊天输入框的架构、子组件、Composable、消息发送流程、桌面端/移动端双模式、@提及系统、音频输入、语音输入、文件上传、预发送消息队列、聊天切换器等功能时使用。
---

# 聊天输入框开发指南

聊天输入框位于 `apps/desktop/src/renderer/src/pages/chat/message/Input/index.vue`，是聊天页的核心交互入口。支持桌面端和移动端两种布局，集成了文本编辑、@提及、文件上传、音频录入、语音识别、模型选择、智能体切换、预发送消息队列等功能。

## 架构概览

```
Input/index.vue
  │
  ├─ 子组件
  │   ├─ PendingMessages.vue        ── 预发送消息列表
  │   ├─ FileUpload                  ── 文件拖拽/选择上传
  │   ├─ AudioInputPreview.vue      ── 已录制音频预览
  │   ├─ AudioInputControls.vue     ── 音频录入控制面板
  │   ├─ DesktopInputActions.vue    ── 桌面端操作栏（发送按钮 + 工具栏）
  │   ├─ MobileToolButton.vue       ── 移动端工具栏按钮
  │   ├─ AtPanel.vue                ── @提及面板
  │   ├─ ChatSwitcherPopover.vue    ── 聊天切换弹出层
  │   └─ ThinkingModeButton.vue     ── 思考模式开关
  │
  ├─ Composables
  │   ├─ useMentionEditor.ts        ── @提及编辑器核心
  │   ├─ useChatInputAudio.ts       ── 音频输入管理
  │   ├─ useVoiceInputControls.ts   ── 语音识别输入
  │   ├─ useChatModelSelection.ts   ── 模型/Provider 选择联动
  │   ├─ useChatSwitcher.ts         ── 聊天切换交互
  │   ├─ useAgentWorkPath.ts        ── 智能体工作路径
  │   ├─ useInputContextTokens.ts   ── 上下文 Token 统计
  │   ├─ useMobileToolLayout.ts     ── 移动端拖拽布局
  │   └─ useProviderOptionsModal.ts ── Provider 设置弹窗
  │
  └─ 样式
      └─ input.css                  ── 输入框全部样式（672 行）
```

## 消息发送流程

```
_sendMessage()
  │
  ├─ 1. syncEditorMessage()                 ── 同步 contenteditable → message ref
  ├─ 2. unwrapConfirmedMentions() + trim()  ── 解析 @提及标记（移除包裹标记）
  ├─ 3. 检查 hasContent (文本/文件/音频)
  ├─ 4. 确保 chat 存在（createChat 懒创建）
  ├─ 5. 解析 @agent:xxx / @智能体:xxx       ── 切换智能体并移除提及文本
  ├─ 6. ensureSendableChat()                ── 校验模型已选择
  ├─ 7. 构建 parts[]: text + file + audio
  ├─ 8. 清空输入（message/selectedFiles/audio）
  └─ 9. sendMessageParts()
        ├─ 生成中 → addPendingMessage()
        └─ 空闲   → sendMessages()
```

### 关键方法链

| 方法 | 位置 | 作用 |
|------|------|------|
| `ensureSendableChat()` | `Input/index.vue:205` | 确保 chat 存在且已选择模型；未选择模型时弹出错误 |
| `sendMessageParts()` | `Input/index.vue:231` | 生成中时入队（pending messages），否则直接发送 |
| `guidePendingMessage()` | `Input/index.vue:149` | 优先发送某条预发送消息（终止当前生成或直接发送） |
| `stopAllGeneratingInCurrentChat()` | `Input/index.vue:167` | 停止当前 chat 所有生成（含 pending 清理） |

## @提及系统

核心在 `useMentionEditor.ts`（554 行），基于 contenteditable 实现富文本编辑器。

### 支持类型

| 类型 | 提及语法 | 显示标签 |
|------|----------|---------|
| 技能 | `@skills:名字` 或 `@技能:名字` | 技能:名字 |
| 文件 | `@file:路径` 或 `@文件:路径` | 文件:路径 |
| 笔记 | `@note:标题` 或 `@笔记:标题` | 笔记:标题 |
| 智能体 | `@agent:名字` 或 `@智能体:名字` | 智能体:名字 |

### 发送时的提及处理

1. `confirmMentionTokens(message)` — 扫描 contenteditable 中的 @chip DOM 节点，提取已确认的提及
2. `separateConfirmedMentionsForSend(confirmed)` — 分离提及与普通文本
3. `unwrapConfirmedMentions(parts)` — 移除 `<\|at_start\|>...<\|at_end\|>` 包裹标记
4. `AGENT_MENTION_REGEX` — 检测 `@agent:xxx` 或 `@智能体:xxx`，自动切换智能体并移除提及文本

### AtPanel 联动

`AtPanel.vue` 通过 `atPanelRef` 暴露 `syncMentionState`、`scheduleClose`、`handleKeydown` 等方法，由 `useMentionEditor` 在输入事件中调用。

## 音频输入系统

`useChatInputAudio.ts` 基于 `useInputAudioRecorder`，支持两种模式：

| 模式 | 触发方式 | 行为 |
|------|----------|------|
| `toggleManualInputAudio` | 手动点击 | 录制一次，停止后添加到 `selectedAudioInputs` |
| `toggleContinuousInputAudio` | 持续模式 | 连续语音检测，自动分段提交 |

音频数据流：`InputAudioItem` → `buildAudioFileParts()` → `FileUIPart[]` → 混入 `parts` 发送。

关键状态：
- `showInputAudioControls` — 控制面板显隐
- `inputAudioIsActive` — 是否有活跃录制
- `inputAudioLevel` — 实时音量级别（驱动 UI 可视化）
- `selectedAudioInputs` — 待发送音频列表

## 语音识别输入

`useVoiceInputControls.ts` 处理语音→文本转换：

- `isRecording` — 是否正在录音
- `isProcessingVoice` — 正在处理语音（此时 placeholder 显示「正在处理语音...」）
- `partialSpeechText` — 中间识别文本，实时显示在输入框下方
- `onRecognizedText` — 识别完成回调，默认立即发送

## 桌面端操作栏

`DesktopInputActions.vue` 通过 `visibleInputButtons`（从 `display.inputButtonLayout` 配置过滤）控制按钮显隐。包含的按钮按顺序：

| 按钮 ID | 功能 |
|---------|------|
| `chat-switcher` | 聊天切换器（`ChatSwitcherPopover`） |
| `upload` | 文件上传 |
| `work-path` | 智能体工作路径 |
| `input-audio` | 音频录入 |
| `voice` | 语音输入 |
| `speech` | TTS 语音播报侧栏 |
| `settings` | Provider 模型设置 |
| `tools` | 工具调用开关 |
| `think` | 思考模式 |
| `tokens` | Token 统计显示 |
| `playlist` | 播放列表侧栏 |
| `stop` | 停止生成 |
| `send` | 发送按钮 |

**聊天切换器**（`useChatSwitcher`）支持内联创建/重命名/删除聊天，显示在当前聊天下方，切换后隐藏。

## 移动端布局

移动端通过 `v-if="isMobile"` 分支渲染完全不同的 DOM 结构：

```
mobile-input-bar
  ├─ mobile-top-left-zone   ── 拖拽工具位（左）
  ├─ mobile-input-wrapper   ── 输入框 + AtPanel + 语音中间文本
  ├─ mobile-top-right-zone  ── 拖拽工具位（右）
  ├─ ChevronDown 按钮       ── 展开/收起底部工具面板
  └─ mobile-send-btn        ── 发送按钮

mobile-tools-panel (v-if showMobileTools)
  └─ mobile-bottom-tools    ── 底部工具位
```

### 移动端拖拽布局

`useMobileToolLayout.ts` 实现了长按拖拽重组工具布局：

- 工具分为三个区域：`topLeft`、`topRight`、`bottom`
- 长按触发 drag，拖动 ghost 元素跟随指针
- 悬停区域高亮显示 `mobile-drop-hover`
- `suppressMobileToolClick` 防止拖拽误触 click
- 布局持久化到 `display.mobileToolLayout`

## 文件上传

文件上传通过 `FileUpload` 子组件（未在 Input 目录下，为公共组件）实现：

- 支持拖拽（`isDragOver`/`isOverDropZone` 驱动 UI）
- 文件列表存储在 `selectedFiles`（`ref<Array<UploadFile>>`）
- 发送前转为 `FileUIPart`（`{ type: 'file', url: path ?? url, ... }`）
- 发送后清空列表

## 快捷键

| 快捷键 ID | handler | 说明 |
|-----------|---------|------|
| `global.focusInput` | `focusEditorAtEnd()` | 全局聚焦输入框 |
| `chat.toggleManualInputAudio` | `toggleManualInputAudio()` | 手动音频录入开关 |
| `chat.toggleContinuousInputAudio` | `toggleContinuousInputAudio()` | 持续音频录入开关 |

预览模式下（`props.preview`）不注册快捷键和 `selectionchange` 监听，避免污染真实聊天页。

## 预览模式

`props.preview` 控制预览模式，用于设置页或嵌入场景：
- 不注册全局快捷键
- 不挂载 `document.selectionchange` 监听
- 仍渲染完整的子组件（但依赖外部注入的 chatStore）

## 扩展指南

### 新增输入按钮（桌面端）

1. 在 `DesktopInputActions.vue` 的 `visibleInputButtons` 支持的按钮列表中添加新 ID
2. 在 `useMobileToolLayout.ts` 的 `MobileDragToolId` 类型中添加（如需移动端）
3. 在 `Input/index.vue` 的 `runMobileToolAction` 中添加对应动作（移动端）
4. 在 `display.inputButtonLayout` 的持久化配置中添加默认可见性

### 新增 @提及类型

1. 在 `useMentionEditor.ts` 的 `MentionChip['kind']` 类型中添加新类型
2. 在 `mentionKindLabelMap` 中添加中文标签
3. 在 `FORMAL_MENTION_REGEX` 中新增匹配模式
4. 在 `AtPanel.vue` 中支持新类型的搜索和选择

### 修改发送逻辑

`_sendMessage()` 是唯一的消息出口。如需在发送前预处理内容、注入额外 parts 或添加校验，修改此方法；不建议绕过它直接调用 `sendMessages`。

## 验证清单

- `_sendMessage` 在有空内容时触发 → 发送成功并清空输入
- 内容为空时点击发送 → 不发送
- 未选择模型时发送 → 弹出「请先选择模型」
- 生成中发送 → 消息进入 pending 队列
- pending 消息可移除、可优先发送
- @agent:xxx 发送后切换智能体并移除提及文本
- 文件拖拽上传正常，拖拽时显示 overlay
- 移动端输入框布局适配正确
- 快捷键全局注册/卸载正确
- `pnpm --filter desktop typecheck` 通过

## 常用源码入口

| 文件 | 职责 |
|------|------|
| `apps/desktop/src/renderer/src/pages/chat/message/Input/index.vue` | 输入框主组件 |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/useMentionEditor.ts` | @提及编辑器核心 |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/useChatInputAudio.ts` | 音频输入管理 |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/useVoiceInputControls.ts` | 语音识别输入 |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/useChatModelSelection.ts` | 模型选择联动 |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/useChatSwitcher.ts` | 聊天切换 |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/useAgentWorkPath.ts` | 工作路径 |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/useInputContextTokens.ts` | Token 统计 |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/useMobileToolLayout.ts` | 移动端拖拽布局 |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/useProviderOptionsModal.ts` | Provider 设置弹窗 |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/DesktopInputActions.vue` | 桌面端操作栏 |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/MobileToolButton.vue` | 移动端工具按钮 |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/AtPanel.vue` | @提及面板 |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/PendingMessages.vue` | 预发送消息列表 |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/input.css` | 全部样式（672行） |
