---
name: agent-qi-app-dev-zh
description: 面向 Agent-Qi / agent-qi-electron 的消息 Part 懒加载渲染方案。涉及消息内容的视口裁剪、content-visibility 性能优化、contain-intrinsic-size 尺寸记忆、消息 Part 渲染链路、滚动锚定、跳变问题排查时使用。
---

# 消息 Part 懒加载渲染方案

消息列表通过 **纯 CSS `content-visibility: auto`** 在两个层级实现视口裁剪，无需 JS 懒加载组件：

1. **消息级**：`.message-item-wrapper`（`list.vue`）— 整条消息离开视口时跳过渲染
2. **Part 级**：`.view-block`（`content.vue`）— 单条消息内每个 part 块（text/reasoning/tool/file）独立裁剪

浏览器原生管理挂载/卸载时机、尺寸记忆（`contain-intrinsic-size: auto`）和滚动锚定，无跳变、无滚不动问题。

## 实现方式

### Part 级裁剪（content.vue）

每个 part 包裹在 `.view-block` 中，通过 CSS `content-visibility: auto` 实现视口外跳过渲染，通过 `contain-intrinsic-size: auto var(--intrinsic-h)` 记忆上次渲染尺寸：

```vue
<div
  v-for="(block, idx) in displayParts"
  :key="getBlockKey(block, idx)"
  class="view-block"
  :class="{ 'view-block--tight': block.type === 'reasoning' || block.type === 'text' }"
  :style="{ '--intrinsic-h': estimatePartHeight(block) + 'px' }"
>
  <!-- text / file / audio / reasoning / dynamic-tool / tool 内容直接渲染 -->
</div>
```

```css
.view-block {
  content-visibility: auto;
  contain-intrinsic-size: auto var(--intrinsic-h, 80px);
}
```

- `content-visibility: auto`：元素在视口外时浏览器跳过渲染（不布局、不绘制），在视口附近时自动恢复
- `contain-intrinsic-size: auto <fallback>`：`auto` 关键字让浏览器记住上次渲染的实际尺寸；首次未渲染时使用 fallback 值
- `--intrinsic-h`：由 `estimatePartHeight(block)` 计算，作为首次渲染前的尺寸 fallback

### 高度估算策略（estimatePartHeight）

| 块类型 | 估算高度 | 计算方式 |
|--------|---------|---------|
| `text` | `60 ~ 1200` | `Math.max(60, Math.min(text.length * 0.7, 1200))` |
| `reasoning` | `200` | 固定值 |
| `dynamic-tool` / `tool*` | `56` | 固定值 |
| `file` | `140` | 固定值 |
| 其他 | `80` | 默认 fallback |

此函数仅作为 CSS intrinsic-size 的初始 fallback。元素首次进入视口渲染后，浏览器自动记忆真实尺寸，后续即使离开视口也使用记忆值，不再依赖估算。

### 消息级裁剪（list.vue）

```css
.message-item-wrapper {
  content-visibility: auto;
  contain-intrinsic-size: auto 100px;
  /* 注意：不使用 contain: content，否则会破坏浏览器原生 scroll anchoring */
}
```

## 使用链路

```
Router (/chat, /temp-chat, /mobile/chat/session)
  └─ ChatMain (components/ChatMain.vue)
      └─ ChatMessageList (pages/chat/message/list.vue)
          ├─ ChatMessageItemAi    (pages/chat/message/Item/ai.vue)
          │   └─ ChatMessageItemContent (pages/chat/message/Item/content.vue)
          │       └─ .view-block (content-visibility:auto)  ◄── part 级裁剪
          └─ ChatMessageItemHuman (pages/chat/message/Item/human.vue)
              └─ ChatMessageItemContent
                  └─ .view-block (content-visibility:auto)  ◄── part 级裁剪
```

- `ChatMessageItemContent`（`content.vue`）遍历 `displayParts`，每个 part 渲染在 `.view-block` 中
- `ChatMessageItemAi` 和 `ChatMessageItemHuman` 都引用 `content.vue`
- `ChatMessageList`（`list.vue`）渲染消息列表，每条消息包在 `.message-item-wrapper` 中

## 为什么不用 JS 懒加载组件

此前使用 `LazyMessagePart.vue`（基于 IntersectionObserver + 手动 mount/unmount）存在以下问题：

| 问题 | 原因 |
|------|------|
| **跳变** | JS 占位用 `minHeight: cachedHeight`，cachedHeight 仅在卸载瞬间采样，无持续同步；初始估算粗糙 |
| **双层冲突** | CSS `content-visibility`（消息级）与 JS `LazyMessagePart`（part 级）两套尺寸系统独立运作 |
| **滚不动** | `.message-item-wrapper` 的 `contain: content` 破坏浏览器原生 scroll anchoring；JS 卸载改变高度时无 scrollTop 补偿 |
| **批量卸载抖动** | 滚动停止 200ms 后所有实例同时 tryUnmount，一次性回缩大量高度 |

纯 CSS 方案由浏览器原生处理，无需 JS 介入，避免以上所有问题。

## 注意事项

- **不要**在 `.message-item-wrapper` 或 `.view-block` 上加 `contain: content`/`contain: layout`，会破坏 scroll anchoring
- `contain-intrinsic-size` 必须带 `auto` 关键字，否则不会记忆真实尺寸，每次离开视口都回退到固定值导致跳变
- 流式输出中的最后一个文本块无需特殊处理——用户在底部观看时它在视口内，浏览器正常渲染；用户滚走后跳过渲染是正确行为
- `content-visibility: auto` 在 Chromium 85+ 支持，Electron 42（Chromium 134+）完全兼容

## 验证清单

- 长对话（100+ 条）初始渲染不卡顿（视口外消息和 part 跳过渲染）
- 滚动时视口外内容不渲染，滚回时自动恢复
- 滚动过程中无明显跳变（浏览器记忆真实尺寸）
- 向上滚动顺畅，不会被高度回缩卡住（scroll anchoring 正常工作）
- 流式输出时最后一个文本块正常实时更新
- `pnpm --filter desktop typecheck` 通过

## 常用源码入口

| 文件 | 职责 |
|------|------|
| `pages/chat/message/Item/content.vue` | Part 级 content-visibility 实现，遍历 parts 渲染 |
| `pages/chat/message/list.vue` | 消息级 content-visibility，消息列表渲染 |
| `components/MessageScrollContainer.vue` | 滚动容器，scrollToBottom + MutationObserver |
| `pages/chat/message/Item/ai.vue` | AI 消息气泡，引用 content.vue |
| `pages/chat/message/Item/human.vue` | 用户消息气泡，引用 content.vue |
