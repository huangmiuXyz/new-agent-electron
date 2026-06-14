---
name: agent-qi-app-dev-zh
description: 面向 Agent-Qi / agent-qi-electron 应用本体开发的中文技能。修改桌面端 Electron/Vue 应用代码时触发。把硬编码的 UI 元素（按钮、工具栏项）改造为数据驱动的可配置列表、支持用户排序与显隐时必须使用此技能。
---

# 数据驱动的按钮布局配置

聊天输入框（`Input/index.vue`）等复杂组件里的按钮原本是硬编码的 Vue 模板。要支持用户自定义顺序与显隐，需将其改造为「配置驱动渲染」。本技能以输入框按钮布局为例，适用于任何类似的工具栏/操作栏改造。

## 1. 在 store 定义配置模型

编辑 `apps/desktop/src/renderer/src/stores/settings.ts`：

用「id + visible」的数组结构表达布局，数组顺序即渲染顺序：

```ts
type ToolButtonId = 'upload' | 'voice' | 'speech' | ...
interface ToolButtonItem { id: ToolButtonId; visible: boolean }

// 默认顺序与现有硬编码顺序保持一致
const createDefaultToolLayout = (): ToolButtonItem[] => [
  { id: 'upload', visible: true },
  { id: 'voice', visible: true },
  ...
]
```

必须同时提供归一化函数，处理持久化后的脏数据：

```ts
const normalizeToolLayout = (raw: unknown): ToolButtonItem[] => {
  const defaults = createDefaultToolLayout()
  const validIds = new Set(defaults.map(i => i.id))
  const result: ToolButtonItem[] = []
  const seen = new Set<ToolButtonId>()
  if (Array.isArray(raw)) {
    raw.forEach(entry => {
      const id = entry?.id
      if (typeof id !== 'string' || !validIds.has(id) || seen.has(id)) return
      seen.add(id)
      result.push({ id, visible: entry.visible ?? true })
    })
  }
  defaults.forEach(item => {           // 补全缺失项
    if (!seen.has(item.id)) result.push({ ...item })
  })
  return result
}
```

接入 `display`、提供 update/reset action、在 `afterRestore` 调用 normalize——详见「显示设置与持久化」技能。

## 2. 改造组件为数据驱动渲染

编辑目标组件（例如 `apps/desktop/src/renderer/src/pages/chat/message/Input/index.vue`）。

### 加 computed 过滤可见项

```ts
const visibleToolButtons = computed(() => {
  const layout = display.value.toolLayout || []
  return layout.filter(i => i.visible).map(i => i.id)
})
```

### 用 v-for + v-if/v-else-if 分发

把原本平铺的按钮包进一个 `<template v-for>`，每个按钮用 `v-else-if="btnId === 'xxx'"` 匹配。**内部按钮代码原样保留**（class、handler、绑定都不动），只加外层条件：

```vue
<div class="action-left">
  <template v-for="btnId in visibleToolButtons" :key="btnId">
    <Button v-if="btnId === 'upload'" variant="icon" size="sm" @click="...">
      <FileUploadIcon />
    </Button>
    <Button v-else-if="btnId === 'voice'" ...>...</Button>
    <!-- 其余按钮 -->
  </template>
</div>
```

约定：

- `:key="btnId"` 必须用 id，保证 Vue 在数组重排时正确复用 DOM。
- 条件渲染按钮（如「停止」依赖生成中、「工作路径」依赖智能体能力）的额外 `v-if` 条件用 `&&` 拼到 `v-else-if` 上：`v-else-if="btnId === 'stop' && isScopeGenerating"`。
- 不在配置范围内的按钮（如发送按钮）保持原位，不进 v-for。

## 3. 新建配置 UI（拖拽排序 + 开关）

在 `apps/desktop/src/renderer/src/pages/settings/` 下新建组件，例如 `ToolButtonConfig.vue`。

用 `vuedraggable`（已安装，`import draggable from 'vuedraggable'`）做拖拽排序：

```vue
<draggable
  v-model="localLayout"
  item-key="id"
  handle=".drag-handle"
  animation="180"
  ghost-class="drag-ghost"
  @end="commit"
>
  <template #item="{ element }">
    <div class="button-row" :class="{ disabled: !element.visible }">
      <div class="drag-handle"><!-- 拖拽手柄图标 --></div>
      <span class="button-name">{{ labelMap[element.id] }}</span>
      <Switch v-model="element.visible" size="sm" />
    </div>
  </template>
</draggable>
```

vuedraggable@4 在 Vue3 的关键约定：

- 用 `v-model` 绑定数组（不要用 `list` prop，两者混用会冲突）。
- `item-key` 必须设为数组元素的唯一字段名（字符串），否则拖拽后 DOM 复用错乱。
- `handle` 指定拖拽手柄选择器，避免整行可拖（开关误触）。
- 用 `#item="{ element }"` 插槽渲染每一项。

### 本地副本与 store 同步

用本地 ref 驱动拖拽，变更时写回 store；同时 watch store 端的外部变更（如恢复默认）回填本地：

```ts
const localLayout = ref(layout.map(i => ({ ...i })))

const commit = () => {
  settingsStore.updateToolLayout(localLayout.value.map(i => ({ id: i.id, visible: i.visible })))
}
watch(localLayout, commit, { deep: true })

watch(() => display.value.toolLayout, (next) => {
  const nextKey = next.map(i => `${i.id}:${i.visible}`).join('|')
  const localKey = localLayout.value.map(i => `${i.id}:${i.visible}`).join('|')
  if (nextKey !== localKey) localLayout.value = next.map(i => ({ ...i }))
})
```

watch 对比用序列化 key 是为了避免「拖拽过程中 store 回写又触发本地更新」的循环。

## 4. 接入显示设置页

详见「显示设置与持久化」技能第 5 步方式 B：在 `display.vue` 的 `<FormContainer>` 内 `<DisplayForm />` 之后追加 `<SettingsToolButtonConfig />`。

## 5. 常见源码入口

- 输入框组件：`apps/desktop/src/renderer/src/pages/chat/message/Input/index.vue`（桌面端按钮在 `.action-left`，约 1880 行起；`v-if="!isMobile"` 分支）
- 移动端已有拖拽布局参考：同文件 `MobileDragToolId` / `mobileToolLayout`（用 useLocalStorage，独立于 Pinia）
- 设置 store：`apps/desktop/src/renderer/src/stores/settings.ts`
- 开关组件：`apps/desktop/src/renderer/src/components/Switch.vue`（`v-model` boolean）

## 6. 验证

- 拖拽后顺序立即生效，刷新后保留。
- 关闭某按钮后输入框对应按钮消失，预览同步。
- 「恢复默认」同时重置顺序与可见性（不能只重置 visible 而保留当前顺序）。
- 清空 indexedDB 后首次加载为默认布局，不报错。
- `pnpm --filter desktop typecheck` 通过。
