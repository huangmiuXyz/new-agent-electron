---
name: agent-qi-app-dev-zh
description: 面向 Agent-Qi / agent-qi-electron 应用本体开发的中文技能。修改桌面端 Electron/Vue 应用代码时触发。新增或调整显示设置项（display settings）、为 Pinia store 增加持久化字段、处理 indexedDB 恢复后的老数据兼容时必须使用此技能。
---

# 显示设置与持久化

设置项通过 `useSettingsStore`（Pinia）集中管理，持久化到 indexedDB。新增设置项时不要新建零散的 localStorage，而是接入现有 `display` 对象并确保向后兼容。

## 1. 数据字段定义

编辑：

`apps/desktop/src/renderer/src/stores/settings.ts`

在 `createDefaultDisplay()`（或对应 ref 的初始值）中新增字段。优先用工厂函数返回默认值，便于在多处（初始值、重置、兼容补全）复用：

```ts
const createDefaultDisplay = () => ({
  // ...现有字段
  myNewField: true
})

const display = ref(createDefaultDisplay())
```

约定：

- 字段类型要明确（boolean / number / 字符串字面量联合），避免 `any`。
- 若字段是数组或对象，默认值用工厂函数生成，不要直接写对象字面量赋给 ref（防止多实例共享引用）。
- 复杂结构（如带 id 的列表）同时定义一个 `createDefaultXxx()` 工厂和一个 `normalizeXxx(raw)` 归一化函数。

## 2. 更新 action

在 store 的 setup 内提供语义化更新方法，并在 `return` 中暴露：

```ts
const updateMyField = (value: boolean) => {
  display.value = { ...display.value, myNewField: value }
}
```

简单字段可直接用现成的 `updateDisplaySettings(partial)`；语义复杂的（如带校验、归一化、联动）单列 action。

## 3. 持久化

`display` 已在 persist `paths` 数组中，新增的 `display.xxx` 字段会**自动持久化**，无需改 paths。

持久化配置位于 store 定义末尾的 `persist` 选项：

```ts
persist: {
  storage: indexedDBStorage,
  paths: ['display', 'system', ...],
  afterRestore: async () => { ... }
}
```

约定：

- 只往现有已持久化对象里加字段，不要新增顶层 ref 再漏加 paths。
- 若新增的是独立顶层 ref（不在 `display` 里），必须把 ref 名加进 `paths`。

## 4. 向后兼容（afterRestore）

老用户的 indexedDB 里没有新字段，恢复后该字段为 `undefined`。必须在 `afterRestore` 里补全默认值：

```ts
afterRestore: async () => {
  const settingsStore = useSettingsStore()
  settingsStore.display = {
    ...settingsStore.display,
    myNewField: settingsStore.display.myNewField ?? true
  }
  // 复杂结构用归一化 action
  settingsStore.updateInputButtonLayout(settingsStore.display.inputButtonLayout)
}
```

约定：

- 标量字段用 `?? defaultValue` 补全。
- 数组/对象字段调用对应的 normalize/更新 action（它在内部做结构校验、补全缺失项、剔除无效项），保证脏数据也能恢复成合法形态。
- 归一化函数要处理：类型不符、缺项、多余项、重复项，保证幂等。

## 5. 接入显示设置页

编辑：

`apps/desktop/src/renderer/src/pages/settings/display.vue`

设置页用 `useForm` 声明式渲染表单。两种接入方式：

**方式 A：加入 useForm 字段（自动渲染控件）**

```ts
const [DisplayForm] = useForm({
  fields: [
    { name: 'myNewField', type: 'boolean', label: '我的开关' }
  ],
  initialData: settingsStore.display,
  onChange: (_field, _value, data) => {
    settingsStore.updateDisplaySettings(data)
  }
})
```

`useForm` 支持 `boolean`(Switch)、`slider`(Slider)、`select`、`textarea`、`custom`(自定义渲染) 等类型，详见 `apps/desktop/src/renderer/src/composables/useForm.tsx`。

**方式 B：追加自定义组件（用于复杂 UI，如拖拽列表、实时预览）**

在 `<FormContainer>` 的 content slot 内，`<DisplayForm />` 之后追加组件：

```vue
<FormContainer header-title="显示设置">
  <template #content>
    <DisplayForm />
    <SettingsMyConfig />  <!-- 自动注册，前缀 Settings + 文件名 -->
  </template>
</FormContainer>
```

## 6. 常见源码入口

- 设置 store：`apps/desktop/src/renderer/src/stores/settings.ts`
- 显示设置页：`apps/desktop/src/renderer/src/pages/settings/display.vue`
- 表单 composable：`apps/desktop/src/renderer/src/composables/useForm.tsx`
- 表单容器：`apps/desktop/src/renderer/src/components/FormContainer.vue`
- 设置页路由：`apps/desktop/src/renderer/src/pages/settings/index.vue`（通过 `?tab=xxx` 切换）
- 组件自动注册：`apps/desktop/src/renderer/src/components.d.ts`（`pages/settings/Xxx.vue` → `SettingsXxx`）

## 7. 验证

- 改动后能运行 `pnpm --filter desktop typecheck`。
- 新字段在设置页可见且可改。
- 修改后刷新/重启应用，值被保留。
- 清空 indexedDB（模拟老用户）后首次加载，字段为默认值而非 `undefined`，不报错。
