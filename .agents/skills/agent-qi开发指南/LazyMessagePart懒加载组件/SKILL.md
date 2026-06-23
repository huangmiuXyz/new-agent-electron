---
name: agent-qi-app-dev-zh
description: 面向 Agent-Qi / agent-qi-electron 的 LazyMessagePart 懒加载渲染组件的开发指南。涉及消息内容的虚拟化懒加载、IntersectionObserver 渲染优化、滚动节流卸载、消息 Part 渲染链路、content.vue 中的使用、性能优化场景时使用。
---

# LazyMessagePart 懒加载渲染组件

`LazyMessagePart` 位于 `apps/desktop/src/renderer/src/components/LazyMessagePart.vue`，是一个基于 `IntersectionObserver` 的消息内容块懒加载容器。它将每个消息 part（文本块、文件块、工具调用块等）包裹起来，只在接近视口时渲染实际内容，远离视口后自动卸载并占位，以优化长对话的渲染性能。

## 组件 API

```vue
<LazyMessagePart
  :always-visible="boolean"    <!-- 是否始终可见（不卸载），默认 false -->
  :estimate-height="number"    <!-- 未挂载时的占位高度（px），默认 80 -->
  :root-margin="string"        <!-- IntersectionObserver rootMargin，默认 '600px 0px' -->
>
  <slot />                     <!-- 需要懒加载的内容 -->
</LazyMessagePart>
```

### Props

| Prop | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `alwaysVisible` | `boolean` | `false` | 设为 `true` 时组件永远保持挂载，不卸载。用于流式输出中的最后一个文本块 |
| `estimateHeight` | `number` | `80` | 未挂载时占位元素的最小高度（px），避免卸载/挂载导致的滚动跳动 |
| `rootMargin` | `string` | `'600px 0px'` | 传递给 `IntersectionObserver` 的 rootMargin，控制预加载范围。默认 600px 意味着在距离视口 600px 时就开始渲染 |

## 使用链路

```
Router (/chat, /temp-chat, /mobile/chat/session)
  └─ ChatMain (components/ChatMain.vue)
      └─ ChatMessageList (pages/chat/message/list.vue)
          ├─ ChatMessageItemAi    (pages/chat/message/Item/ai.vue)
          │   └─ ChatMessageItemContent (pages/chat/message/Item/content.vue)
          │       └─ LazyMessagePart (components/LazyMessagePart.vue)  ◄── 使用处
          └─ ChatMessageItemHuman (pages/chat/message/Item/human.vue)
              └─ ChatMessageItemContent
                  └─ LazyMessagePart  ◄── 使用处
```

- `LazyMessagePart` 为**全局自动注册**组件（`unplugin-vue-components`），无需显式 import
- 唯一直接使用它的组件是 `ChatMessageItemContent`（`content.vue`）
- `content.vue` 被 `ChatMessageItemAi` 和 `ChatMessageItemHuman` 两个消息气泡组件引用
- 这两个组件都被同一消息列表 `ChatMessageList`（`list.vue`）使用

## content.vue 中的使用模式

`content.vue` 遍历 `displayParts`（消息的 parts 数组），对每个 part 包裹一层 `LazyMessagePart`：

```vue
<div v-for="(block, idx) in displayParts" :key="getBlockKey(block, idx)">
  <LazyMessagePart
    :always-visible="isPartAlwaysVisible(block, idx)"
    :estimate-height="estimatePartHeight(block)"
  >
    <!-- 文本块 -->
    <div v-if="block.type === 'text'">
      <Markdown v-if="markdown" :block="block" :message="message"
        :streaming="streaming && idx === lastTextBlockIndex" />
      <div v-else class="text-content">{{ block.text }}</div>
    </div>

    <!-- 非音频文件块 -->
    <FileUpload v-if="isNonAudioFilePart(block)" :removable="false"
      :files="[filePartToUploadFile(block)]" />

    <!-- 音频块 -->
    <AudioInputPreview v-if="isAudioFilePart(block)"
      :audios="[audioPartToPreviewItem(block, idx)]"
      :removable="false" variant="message" />

    <!-- reasoning 块 -->
    <ChatMessageItemReasoning_content v-if="block.type === 'reasoning'"
      :reasoning_content="block.text" />

    <!-- dynamic-tool 块 -->
    <ChatMessageItemDynamicTool v-if="block.type === 'dynamic-tool'"
      :message="message" :tool_part="block" />

    <!-- tool 块 -->
    <ChatMessageItemTool v-if="block.type.startsWith('tool')"
      :tool_part="block" :message="message" />
  </LazyMessagePart>
</div>
```

### 高度估算策略 (`estimatePartHeight`)

| 块类型 | 估算高度 | 计算方式 |
|--------|---------|---------|
| `text` | `60 ~ 1200` | `Math.max(60, Math.min(text.length * 0.7, 1200))` |
| `reasoning` | `200` | 固定值 |
| `dynamic-tool` / `tool*` | `56` | 固定值 |
| `file` | `140` | 固定值 |
| 其他 | `80` | 默认 fallback |

### 始终可见策略 (`isPartAlwaysVisible`)

```ts
const isPartAlwaysVisible = (block, idx) => {
  // 流式输出中，只有最后一个文本块保持始终可见
  if (props.streaming && idx === lastTextBlockIndex.value && block.type === 'text') {
    return true
  }
  return false
}
```

仅在以下条件下保持挂载：正在流式输出、当前块是最后一个文本块。保证用户能实时看到流式内容。

## 工作原理

### 1. 挂载触发（IntersectionObserver）

```
滚动进入 rootMargin 范围（默认视口外 600px）
  └─ IntersectionObserver 回调 → entry.isIntersecting === true
      └─ isMounted.value = true
          └─ 渲染 slot 内容
```

### 2. 卸载触发（scroll + IntersectionObserver）

```
用户滚动使元素远离视口
  ├─ IntersectionObserver 回调 → entry.isIntersecting === false
  │   └─ tryUnmount()
  │       ├─ 检查：不在 scrolling 中（200ms 滚动节流冷却后方可卸载）
  │       ├─ 检查：不在视口内（isOutsideViewport）
  │       └─ 通过 → 缓存 offsetHeight → isMounted = false
  └─ scroll 事件 → isScrolling = true
      └─ 200ms 无滚动 → isScrolling = false → nextTick(tryUnmount)
```

### 3. 首次挂载

`onMounted` 中直接检查元素是否在视口附近（同步计算 `getBoundingClientRect`），避免依赖 IntersectionObserver 的异步首次回调。

### 4. 滚动节流

全局 `scroll` 事件（capture phase）监听，滚动期间禁止卸载，停止滚动 200ms 后才允许 `tryUnmount`，防止滚动过程中卸载抖动。

### 5. 缓存高度

卸载前将实际 `offsetHeight` 写入 `cachedHeight`，再次挂载前 placeholder 使用缓存高度而非 `estimateHeight`，减少跳动。

## 注意事项

- **不要移除** `tryUnmount` 中的 `isOutsideViewport` 检查，缺少它会导致 IntersectionObserver 刚触发非交叉就卸载（滚动中短暂离开再回来）
- `alwaysVisible` 变化时通过 `watch` 立即设为 `true`
- 组件卸载时调用 `stop()` 停止 IntersectionObserver
- 占位元素 (`lazy-message-part__placeholder`) 使用 `minHeight` 而非 `height`，允许内容撑开

## 验证清单

- 长对话（100+ 条）初始渲染不卡顿（DOM 节点数可控）
- 滚动时远处内容自动卸载，近处内容自动挂载
- 流式输出中的最后一个文本块始终保持可见
- 快速滚动时不会频繁挂载/卸载导致闪烁
- `estimateHeight` 与真实内容高度不匹配时不会导致严重布局偏移
- `pnpm --filter desktop typecheck` 通过

## 常用源码入口

| 文件 | 职责 |
|------|------|
| `components/LazyMessagePart.vue` | 懒加载容器组件本身 |
| `pages/chat/message/Item/content.vue` | 唯一使用方，遍历 parts 逐个包裹 |
| `pages/chat/message/Item/ai.vue` | AI 消息气泡，引用 content.vue |
| `pages/chat/message/Item/human.vue` | 用户消息气泡，引用 content.vue |
| `pages/chat/message/list.vue` | 消息列表，渲染 ai/human/system 三种气泡 |
