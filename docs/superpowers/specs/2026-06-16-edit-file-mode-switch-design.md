# edit_file 工具编辑模式切换设计

## 背景

当前 `edit_file` 内置工具仅支持 hashline 编辑模式（自定义行号编辑格式 + 快照标签）。代码库中已存在一套 Codex 标准补丁（applyPatch）实现，包括 preload 桥接（`window.api.applyPatch.execute`）、IPC handler（`apply-patch:execute`）和主进程服务（`applyPatch.ts`），但未接入任何工具的执行路径。

本设计在 `edit_file` 工具的「配置」弹窗中增加「编辑模式」选项，让用户可在 hashline 与 patch 两种模式间切换，复用已有的 applyPatch 后端。

## 数据模型

在 `Agent.builtinToolConfigs` 中新增 `edit_file` 配置：

```ts
builtinToolConfigs?: {
  computer_use?: { screenshotMaxSidePx?: number }
  edit_file?: { mode?: 'hashline' | 'patch' }   // 新增
  [toolName: string]: Record<string, unknown> | undefined
}
```

- 默认 `'hashline'`，向后兼容。
- `'patch'` 切换到 Codex 补丁格式。

## 配置 UI

在 `useAgent.tsx` 工具「配置」弹窗中，针对 `edit_file` 新增「编辑模式」下拉，复用 `computer_use` 截图分辨率的既有模式：

- 哈希行模式（默认）
- 补丁模式

## 配置传递链路

`builtinToolConfigs` 已从 `useChat → chatService → getBuiltinTools → grouped-tools` 流通，但当前未传给 `getCodexBuiltinTools()`。补上：

```
grouped-tools.ts:
  getCodexBuiltinTools({ editFileMode: options?.builtinToolConfigs?.edit_file?.mode })
```

工具在每次对话构建时按当前 agent 配置重建，模式在构建时烘焙进 `edit_file` 的 `description` 与 `execute`。

## edit_file 工具行为切换

| | 哈希行模式（默认） | 补丁模式 |
|---|---|---|
| description | hashline 语法说明（现状） | Codex 补丁格式说明 |
| content 含义 | `¶path#TAG` + 行操作 | 完整补丁文本（`*** Begin Patch...End Patch`） |
| execute 路径 | `window.api.editFile.execute()`（现状） | `window.api.applyPatch.execute({ baseDir, patch: content })` |
| type 参数 | add/delete/move/update 分别处理 | 忽略，补丁内部用 `*** Add/Delete/Update File` 表达 |

补丁模式下 readFile 仍返回 hashline 格式，description 会引导 AI 据此构造补丁。改动最小。

## 渲染组件适配

`EditFileRender.vue` 根据 content 自动检测模式：

- 含 `*** Begin Patch` → 补丁模式：解析 `*** Update/Add/Delete File` 展示文件级操作。
- 否则 → 哈希行模式：现状 diff 预览。

## 改动文件清单

| 文件 | 改动 |
|---|---|
| `packages/types/src/agent.ts` | 新增 `edit_file.mode` 类型 |
| `apps/desktop/src/renderer/src/composables/useAgent.tsx` | 工具配置弹窗加「编辑模式」选项 |
| `apps/desktop/src/renderer/src/services/builtin-tools/grouped-tools.ts` | 传 `edit_file.mode` 给 `getCodexBuiltinTools` |
| `apps/desktop/src/renderer/src/services/builtin-tools/tools/codex-tools.ts` | 接收模式，切换 description + execute |
| `apps/desktop/src/renderer/src/services/builtin-tools/components/codex/EditFileRender.vue` | 自动检测并适配补丁模式展示 |

## 向后兼容

- 默认 `hashline`，未配置 `edit_file.mode` 的既有 agent 行为不变。
- applyPatch 后端、preload 桥接、IPC handler 均已存在，无需新增主进程代码。
