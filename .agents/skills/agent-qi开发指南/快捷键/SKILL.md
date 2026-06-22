---
name: agent-qi-app-dev-zh
description: 面向 Agent-Qi / agent-qi-electron 应用本体开发的中文技能。用于修改桌面端 Electron/Vue 应用代码时触发，尤其适合新增或调整快捷键、聊天输入框行为、设置持久化、渲染进程 UI、Pinia store、全局面板、移动端兼容和应用级交互流程。新增快捷键时必须使用此技能。
---

# Agent-Qi 应用本体开发

修改应用代码时优先阅读真实源码和现有模式，不把通用 Electron/Vue 经验直接套到本仓库。

## 新增快捷键

新增快捷键必须接入共享快捷键系统，不要为普通应用快捷键新增零散的全局 `keydown` 监听。

### 1. 添加快捷键元数据

编辑：

`apps/desktop/src/renderer/src/composables/shortcutsConfig.ts`

在 `BUILTIN_SHORTCUTS` 中新增配置：

```ts
{
  id: 'chat.toggleManualInputAudio',
  name: '手动录入开关',
  description: '一键开启/关闭手动音频录入',
  defaultKey: 'F8',
  enabled: true,
  editable: true,
  scope: 'chat',
  allowedInInput: true
}
```

约定：

- `id` 使用稳定命名空间，例如 `chat.someAction`、`global.someAction`。
- 聊天页专属行为使用 `scope: 'chat'`。
- 输入框聚焦时也要生效的快捷键设置 `allowedInInput: true`。
- 默认键必须先检查现有 `BUILTIN_SHORTCUTS`，避免冲突。
- 默认键保持 `editable: true`，让用户可以处理系统级或个人习惯冲突。

### 2. 在行为归属处注册动作

在真正拥有该行为的组件或 composable 里注册，不要集中堆到无关页面。

示例：

```ts
const { register, unregister } = useShortcuts()

onMounted(() => {
  register({
    id: 'chat.toggleManualInputAudio',
    handler: () => {
      void toggleManualInputAudio()
    }
  })
})

onUnmounted(() => {
  unregister('chat.toggleManualInputAudio')
})
```

约定：

- `register` 的 `id` 必须和 `shortcutsConfig.ts` 完全一致。
- 组件卸载时必须 `unregister`，避免旧 handler 残留。
- 聊天输入框相关快捷键通常放在 `apps/desktop/src/renderer/src/pages/chat/message/Input/index.vue`。
- 如果快捷键关闭某个模式时还要清空 UI 状态或待发送内容，应由拥有状态的 composable 暴露明确动作，例如 `closeAndClearInputAudioPanel()`，快捷键 handler 调用该动作。

### 3. 处理持久化设置

快捷键设置持久化在：

`apps/desktop/src/renderer/src/stores/settings.ts`

新增内置快捷键时，要保证老用户已有的快捷键设置不会覆盖掉新项，也不会丢失自定义按键。

要求：

- 从 `BUILTIN_SHORTCUTS` 合并最新内置快捷键。
- 已存在的快捷键保留用户的 `currentKey` 和 `enabled`。
- 新增的快捷键使用内置默认配置。
- 如果仓库已有 `syncBuiltinShortcuts` 之类函数，优先复用或更新它。

设置恢复后，`App.vue` 会把持久化快捷键同步到 `ShortcutManager`。如果新增同步流程，要确认这里仍然会执行。

### 4. 验证

完成后至少检查：

- 设置页「快捷键」列表能看到新增项。
- 修改快捷键后立即生效。
- 禁用快捷键后不再触发。
- `allowedInInput: true` 的快捷键在聊天输入框聚焦时仍能触发。
- 关闭类快捷键是否同时处理了相关面板、录入状态、预览内容或待发送内容。
- 能运行时执行 `pnpm --filter desktop typecheck`。

## 常见源码入口

- 快捷键配置：`apps/desktop/src/renderer/src/composables/shortcutsConfig.ts`
- 快捷键运行时：`apps/desktop/src/renderer/src/composables/useShortcuts.ts`
- 快捷键设置页：`apps/desktop/src/renderer/src/pages/settings/shortcuts.vue`
- 设置持久化：`apps/desktop/src/renderer/src/stores/settings.ts`
- 应用启动同步：`apps/desktop/src/renderer/src/App.vue`
- 聊天输入框：`apps/desktop/src/renderer/src/pages/chat/message/Input/index.vue`
