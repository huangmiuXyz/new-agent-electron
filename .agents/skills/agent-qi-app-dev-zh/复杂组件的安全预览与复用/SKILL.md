---
name: agent-qi-app-dev-zh
description: 面向 Agent-Qi / agent-qi-electron 应用本体开发的中文技能。修改桌面端 Electron/Vue 应用代码时触发。在设置页等非业务上下文中复用强耦合的业务组件做预览、或给复杂组件增加安全复用模式时必须使用此技能。
---

# 复杂组件的安全预览与复用

本仓库有些业务组件（典型如聊天输入框 `Input/index.vue`）是「单例式」设计：零 props、强耦合全局 store、在 onMounted 注册全局快捷键和 document 监听、交互时会修改真实数据或发起网络请求。直接在设置页等非业务上下文里挂载它们会产生严重副作用。本技能描述如何安全复用这类组件做预览。

## 1. 先评估复用成本

复用前必须确认目标组件的副作用面。重点查：

- `defineProps/defineEmits/defineExpose`：是否零接口、数据从哪来（如直接读 `chatStore.currentChat`）。
- `onMounted/onUnmounted`：是否注册全局快捷键（`useShortcuts().register`）、`document.addEventListener`、`window.addEventListener`、启动定时器、发请求。
- 交互 handler：点击/输入是否调用会改全局状态或发网络的函数（`createChat`、`updateSpeechEnabled`、`sendMessages`、`triggerHook`）。
- `watch`：是否监听并写回 store 或 localStorage。

本仓库典型副作用清单（以输入框组件为例）：

| 副作用 | 位置 | 影响 |
|--------|------|------|
| 注册全局快捷键 | onMounted 内 `register(...)` | 预览实例会抢占真实页同名快捷键 |
| document selectionchange 监听 | onMounted 内 | 全局监听残留 |
| 读写全局草稿 | `chatStore.getChatDraft/setChatDraft` | 预览输入污染用户真实草稿 |
| 创建真实聊天 | 选择模型/工具时 `createChat()` | 凭空产生聊天记录 |
| 发起网络/硬件 | `toggleVoiceRecording`（麦克风+网络）、`_sendMessage` | 不可接受的副作用 |

## 2. 选择复用模式

### 模式 A：preview prop 屏蔽生命周期副作用（推荐，改动最小）

给组件加可选 prop，在 onMounted/onUnmounted 里按 prop 跳过全局副作用，**只保留渲染**：

```ts
const props = defineProps<{
  preview?: boolean
}>()

onMounted(() => {
  if (!props.preview) {
    register({ id: 'global.focusInput', handler: () => {...} })
    document.addEventListener('selectionchange', handler)
  }
  // 纯本地 DOM 操作（renderEditorContent 等）保留，无外部副作用
  nextTick(() => renderEditorContent())
})

onUnmounted(() => {
  if (!props.preview) {
    unregister('global.focusInput')
    document.removeEventListener('selectionchange', handler)
  }
})
```

约定：

- 只包「有外部副作用」的部分（快捷键注册、document/window 监听、网络/硬件初始化）。
- 纯本地 DOM 渲染逻辑（调整高度、渲染编辑器内容）保留，保证预览视觉完整。
- onUnmounted 的清理要和 onMounted 的注册用同一个 `if (!props.preview)` 守卫，保持对称、幂等。
- 不要为了预览去改业务 handler 的逻辑——交互屏蔽交给外层 wrapper（见下）。

### 模式 B：外层 wrapper 屏蔽交互事件

preview prop 只能屏蔽生命周期副作用，用户点击按钮仍会触发 handler。用 wrapper 的 CSS + 事件拦截彻底禁用交互：

```vue
<div
  class="preview-wrapper"
  @click.capture.stop.prevent
  @pointerdown.capture.stop.prevent
  @mousedown.capture.stop.prevent
>
  <ChatInput preview />
</div>

<style scoped>
.preview-wrapper {
  pointer-events: none;  /* 兜底：屏蔽所有指针交互 */
}
</style>
```

约定：

- `@xxx.capture.stop.prevent` 在捕获阶段拦截，比冒泡阶段更早阻断。
- `pointer-events: none` 作为 CSS 兜底，确保连 hover popover、focus 都不会触发。
- 两个机制叠加是因为某些组件（如 contenteditable 编辑器、弹层）可能绕过单一机制。

**模式 A + B 组合**是本仓库复用强耦合组件做预览的标准做法：A 管生命周期副作用，B 管交互副作用。

### 模式 C：深度重构（仅在需保留部分交互时）

若预览需要保留部分真实交互（例如让用户在预览里试点按钮看效果），则必须深度重构：给组件加 `mode: 'live' | 'preview'`，在 preview 模式下让 `message` 用局部 ref、各 handler no-op、跳过 createChat。这是侵入式改动，只在确有必要时采用。

## 3. 预览容器布局要点

预览组件放进设置页时，常见布局坑：

- **垂直居中**：预览框要 `display: flex; flex-direction: column; justify-content: center`，且必须用 `flex: 1; min-height: 0` 填满父容器高度——否则容器被内容撑开、没有富余空间，`justify-content` 不生效。
- **等高对齐**：左右分栏（排序 + 预览）时，父用 `display: flex; align-items: stretch`，让一侧的固定高度（如排序列表 `height: 280px`）决定整体高度，另一侧 stretch 等高。
- **限高 + 滚动**：排序列表用固定 `height`（不是 `max-height`）才能成为高度基准；预览框用 `flex:1` 填满剩余空间。

## 4. 自动注册的隐式依赖

复用业务组件时注意它依赖的「自动注册组件」（不在 import 里出现）：

- 本仓库用 `unplugin-vue-components` + `unplugin-auto-import`，`components.d.ts` / `auto-imports.d.ts` 是生成文件，记录了所有自动注册的组件和 API。
- 例如 `ChatAgentSelector` 实际指向 `pages/chat/AgentSelector.vue`（通过 components.d.ts 映射），`ModelSelector` 在 `components/ModelSelector.vue`。
- `isMobile`、`useChatsStores`、`messageApi` 等是全局自动导入的，设置页内可直接访问。
- 复用前确认这些隐式依赖在目标上下文能正常解析（大部分能，因为是全局注入）。

## 5. 常见源码入口

- 聊天输入框：`apps/desktop/src/renderer/src/pages/chat/message/Input/index.vue`（preview prop 示例）
- 全局快捷键：`apps/desktop/src/renderer/src/composables/useShortcuts.ts`
- 组件映射：`apps/desktop/src/renderer/src/components.d.ts`
- 自动导入声明：`apps/desktop/src/renderer/src/auto-imports.d.ts`
- 设备类型判断：`apps/desktop/src/renderer/src/composables/useDeviceType.ts`（`isMobile` 来源）

## 6. 验证

- 预览实例挂载后，真实聊天页的同名快捷键不被抢占（在聊天页按快捷键仍聚焦真实输入框）。
- 在预览里点击任何按钮/输入文字，不产生真实副作用（不建聊天、不改全局设置、不发请求、不申请麦克风）。
- 预览组件卸载后无 document/window 监听残留（DevTools Event Listeners 面板干净）。
- 预览视觉与真实组件一致（按钮状态、布局、暗色模式跟随）。
