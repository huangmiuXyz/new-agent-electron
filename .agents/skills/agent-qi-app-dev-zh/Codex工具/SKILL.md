---
name: agent-qi-app-dev-zh
description: 面向 Agent-Qi / agent-qi-electron 应用本体开发的中文技能。涉及 Codex 内置工具（readFile、edit_file、search_project、list_dir、exec_command、change_working_directory）的修改或新增时，必须使用此技能。
---

# Codex 内置工具链路

Codex 工具是预设给 AI 智能体的文件操作/命令执行类内置工具，定义在渲染进程，通过 Preload bridge 调用主进程能力。整体分四层：

```
智能体 (Agent)
  └─► builtinToolConfigs.edit_file.mode  ('hashline' | 'replace')
        │
        ▼
grouped-tools.ts ── getCodexBuiltinTools({ editFileMode })
        │
        ▼
codex-tools.ts ── 6 个工具定义 (readFile, edit_file, search_project, list_dir, exec_command, change_working_directory)
        │
        ├─► Render 组件 (Vue) ── builtin-tools/components/codex/*.vue
        │
        └─► window.api.* (Preload bridge) ──► 主进程 IPC handler
```

## 1. 工具注册链路

### grouped-tools.ts（分组注册）

`apps/desktop/src/renderer/src/services/builtin-tools/grouped-tools.ts`

每个工具组导出为 `BuiltinToolGroupEntry` 列表，Codex 工具组的 key 为 `'Codex工具'`：

```ts
{
  group: 'Codex工具',
  tools: getCodexBuiltinTools({
    editFileMode: options?.builtinToolConfigs?.edit_file?.mode // from Agent config
  })
}
```

`editFileMode` 从智能体的 `builtinToolConfigs.edit_file.mode` 读取，决定 `edit_file` 和 `readFile` 的工作模式。配置定义在：

- `packages/types/src/agent.ts` → `Agent.builtinToolConfigs.edit_file.mode`

### index.ts（聚合导出）

`apps/desktop/src/renderer/src/services/builtin-tools/index.ts`

将所有工具组展开合并为一个 `Tools` Record，同时合并插件的内置工具：

```ts
export const getBuiltinTools = (options?) => ({
  ...Object.assign({}, ...groupEntries.map(({ tools }) => tools)),
  ...(pluginTools)
})
```

### 工具动态分发

`general-tools.ts` 中的 `multi_tool_use_parallel` 负责运行时分发：

```ts
const tool = builtinTools[target.toolName]  // e.g. builtinTools['search_project']
const output = await tool.execute(params, options)
```

寻址格式：`builtin.<toolName>`，在 `general-tools.ts` 中被剥离 `builtin.` 前缀。

## 2. 六个工具详细实现

### 2.1 change_working_directory

| 项目 | 内容 |
|------|------|
| 文件 | `codex-tools.ts:330-377` |
| 功能 | 临时切换当前对话后续工具调用的工作路径 |
| Schema | `{ path: string }` |
| 关键逻辑 | 调用 `useCanvasStore().setWorkspaceRoot(nextPath, chatId)` |
| 路径解析 | `resolveWorkspaceRootPath()` — 支持绝对路径，相对路径基于之前的工作路径，不会越界检查（因为是切换根路径） |
| Render | `ChangeWorkingDirectoryRender.vue` |

### 2.2 readFile

| 项目 | 内容 |
|------|------|
| 文件 | `codex-tools.ts:378-492` |
| 功能 | 读取 workPath 内的文本文件 |
| Schema | `{ path, start_line?, end_line?, limit?, max_columns? }` |
| 模式 | `hashline` 模式返回 `¶path#TAG` 头 + `行号:内容`；`replace` 模式返回纯文本 |
| 调用链 | `codex-tools.ts` → `window.api.hashline.read({...})` → `ipcRenderer.invoke('hashline:read')` → 主进程 `hashline.ts` (handler) |
| Render | `ReadFileRender.vue` |

**主进程 handler** (`apps/desktop/src/main/services/hashline.ts:540`)：
```ts
ipcMain.handle('hashline:read', async (_event, payload: HashlineReadPayload) => {
  // 读取文件 → 按行号范围截取 → 根据 format 输出 hashline 格式或纯文本
})
```

### 2.3 list_dir

| 项目 | 内容 |
|------|------|
| 文件 | `codex-tools.ts:493-655` |
| 功能 | 列出目录下的文件和子目录，支持递归深度限制 |
| Schema | `{ path, max_depth?, max_length? }` |
| 关键逻辑 | 递归遍历目录，支持 `.gitignore` 过滤（通过 `ignore` 库），目录优先排序 |
| 路径解析 | `resolvePath()` — 路径必须在 workPath 内，禁止越界 |
| Render | `ListDirRender.vue` |

### 2.4 search_project

| 项目 | 内容 |
|------|------|
| 文件 | `codex-tools.ts:656-771` |
| 功能 | 在 workPath 内执行 rg 风格搜索 |
| Schema | `{ cmd: string }` |
| 关键逻辑 | 注入 bundled ripgrep 路径（不依赖环境 PATH），解析搜索输出为 `SearchHit[]`，生成 search_summary |
| 调用链 | `codex-tools.ts` → `injectBundledRipgrepPath()` → `execProjectSearchCommand()` → `window.api.execFileCommand()` |
| 辅助文件 | `command-utils.ts:63-101` — `injectBundledRipgrepPath` 将命令中的 `rg` 替换为 bundled 路径 |
| Render | `SearchProjectRender.vue` |

### 2.5 exec_command

| 项目 | 内容 |
|------|------|
| 文件 | `codex-tools.ts:772-832` |
| 功能 | 在终端会话中执行命令（测试、构建、git 等） |
| Schema | `{ command, terminal_id? }` |
| 关键逻辑 | 先检查 `getDedicatedFileToolHint()` 是否有对应的专用工具替代；然后通过 `useTerminal().createTab()` 创建/复用终端 |
| 终端复用 | 支持 `terminal_id` 复用同一终端上下文，避免每次创建新终端 |
| 辅助文件 | `command-utils.ts:170-223` — `getDedicatedFileToolHint` 检测 grep/cat/ls 等命令并提示用户改用专用工具 |
| Render | 无专用渲染组件 |

### 2.6 edit_file

| 项目 | 内容 |
|------|------|
| 文件 | `codex-tools.ts:833-1032` |
| 功能 | 编辑 workPath 内的文件，两套模式 |
| Schema (replace) | `{ path, old_string, new_string, replace_all? }` |
| Schema (hashline) | `{ type?, path?, new_path?, content? }` |

**replace 模式**（默认）：
- `old_string` 匹配原文件内容 → `new_string` 替换
- 精确匹配，支持 `replace_all` 全量替换
- 弯引号/直引号兼容处理
- 调用链：`codex-tools.ts` → `window.api.editFile.execute({type:'replace',...})` → `ipcRenderer.invoke('edit-file:execute')` → 主进程 `searchReplace.ts`

**hashline 模式**：
- `type` 支持 `update/add/delete/move`
- update 走 hashline 语法：`¶path#TAG` → `replace N..M:` / `delete N..M` / `insert before N:` 等
- 调用链同上，主进程 `searchReplace.ts` 内部调用 `hashline.ts` 的 `parseHashlineOperations` / `applyHashlineOperations`

**主进程 handler** (`apps/desktop/src/main/services/searchReplace.ts:375`)：
```ts
ipcMain.handle('edit-file:execute', async (_event, payload) => {
  // type=replace → searchReplace on file content
  // type=update → parseHashlineOperations → applyHashlineOperations
  // type=add → writeNewFile
  // type=delete → deleteFile
  // type=move → renameFile
})
```

Render: `EditFileRender.vue`

## 3. Preload Bridge

`apps/desktop/src/preload/index.ts` — 通过 `contextBridge.exposeInMainWorld('api', {...})` 暴露给渲染进程。

Codex 工具使用的 API：

| API 路径 | 暴露方式 | 用途 |
|----------|----------|------|
| `window.api.fs.*` | 直接暴露 Node `fs` | 文件系统操作（existsSync, readdirSync, lstatSync 等） |
| `window.api.path.*` | 直接暴露 Node `path` | 路径操作（resolve, join, relative, isAbsolute, normalize） |
| `window.api.execFileCommand(file, args, options?)` | 自定义 Promise | spawn 子进程执行命令，返回 `{code, stdout, stderr}` |
| `window.api.getBundledRipgrepPath()` | 自定义函数 | 返回 bundled ripgrep 可执行文件路径 |
| `window.api.hashline.read(payload)` | IPC invoke | 调用 `hashline:read` |
| `window.api.editFile.execute(payload)` | IPC invoke | 调用 `edit-file:execute` |

## 4. 主进程 IPC 处理器

### hashline.ts

`apps/desktop/src/main/services/hashline.ts:540`

```ts
type HashlineReadPayload = {
  baseDir: string
  path: string
  start_line?: number
  end_line?: number
  limit?: number    // 默认 160，最大 2000
  max_columns?: number  // 默认 240
  format?: 'hashline' | 'plain'
}
```

逻辑：读取文件 → 按行号范围截取 → 计算 snapshot tag (FNV-1a hash) → 根据 format 输出：
- `plain`：纯文本（无行号、无文件头）
- `hashline`：`¶path#TAG` + `行号:内容`

### searchReplace.ts

`apps/desktop/src/main/services/searchReplace.ts:375`

```ts
type HashlineEditPayload = {
  baseDir?: string
  input?: string           // hashline 编辑指令
  type?: 'add' | 'delete' | 'update' | 'move' | 'replace'
  path?: string
  new_path?: string
  old_string?: string      // replace 模式
  new_string?: string      // replace 模式
  replace_all?: boolean    // replace 模式
  content?: string         // add 模式
}
```

## 5. 辅助文件

### command-utils.ts

`apps/desktop/src/renderer/src/services/builtin-tools/tools/command-utils.ts`

| 导出 | 用途 |
|------|------|
| `injectBundledRipgrepPath(command)` | 将命令中的 `rg` 替换为 bundled ripgrep 路径；处理管道链、PowerShell 兼容 |
| `getDedicatedFileToolHint(command, tools)` | 检测 grep/cat/ls 等 shell 命令，提示用户改用内置专用工具 |
| `execRipgrepSearch(query, options?)` | 直接调用 ripgrep 搜索（固定参数） |

### codex-utils.ts

`apps/desktop/src/renderer/src/services/builtin-tools/tools/codex-utils.ts`

| 导出 | 用途 |
|------|------|
| `parsePatchDocument(rawPatch)` | 解析 `*** Begin Patch` ~ `*** End Patch` 格式的补丁文档 |
| `applyUpdateChunks(original, chunks)` | 将解析后的补丁 chunk 应用到文件内容 |
| `applySearchReplace(input, baseDir)` | 执行 search/replace 操作（modify/add/delete/move） |
| `validateReadOnlyCommand(command)` | 验证命令是否只读（白名单机制） |

### codexUtils.ts（Render 共享）

`apps/desktop/src/renderer/src/services/builtin-tools/components/codex/codexUtils.ts`

| 导出 | 用途 |
|------|------|
| `toCanvasRelativePath(rawPath, message)` | 把路径转 canvas 工作区相对路径 |
| `canOpenInCanvas(rawPath, message)` | 判断能否在 canvas 中打开 |
| `openInCanvas(rawPath, message, line?)` | 在 canvas 中打开文件并切换到 canvas 侧栏 |
| `parseHashline(text)` | 解析 hashline 文本为 `ParsedHashline` |
| `parseSearchSummary(text)` | 从 search_project 输出提取候选文件 |
| `extractResultText(result)` | 从 tool result 取文本内容 |

## 6. Render 组件

所有 render 组件在 `apps/desktop/src/renderer/src/services/builtin-tools/components/codex/`：

| 文件 | 用途 |
|------|------|
| `CodexSummaryBar.vue` | 可复用组件：路径徽章 + canvas 打开 + 复制按钮 |
| `ReadFileRender.vue` | 显示文件内容（hashline 或纯文本模式） |
| `SearchProjectRender.vue` | 搜索结果的候选文件列表 |
| `EditFileRender.vue` | 编辑操作的 diff/结果展示 |
| `ListDirRender.vue` | 目录结构树 |
| `ChangeWorkingDirectoryRender.vue` | 工作路径切换通知 |

## 7. 路径解析安全机制

| 函数 | 文件位置 | 规则 |
|------|----------|------|
| `resolveWorkspaceRootPath` | `codex-tools.ts:44` | 切换工作路径用，只检查路径存在性和是目录 |
| `resolvePath` | `codex-tools.ts:70` | 读文件/编辑/列目录用，强制路径在 workPath 内，禁止越界 |
| `resolvePatchPathInBaseDir` | `codex-utils.ts:9` | patch/搜索替换用，同上越界检查 |

## 8. 工具可用性控制

```ts
const getAvailableBuiltinToolSet = (options) => {
  if (options?.availableBuiltinTools) return new Set(options.availableBuiltinTools)
  return currentAgent?.builtinTools ? new Set(currentAgent.builtinTools) : null
}
```

`exec_command` 通过此机制检查 `search_project` / `readFile` / `list_dir` 是否可用，若可用则拦截对应的 shell 命令并提示用户使用专用工具。

## 9. 常见源码入口

| 文件 | 职责 |
|------|------|
| `apps/desktop/src/renderer/src/services/builtin-tools/tools/codex-tools.ts` | 6 个 Codex 工具定义 |
| `apps/desktop/src/renderer/src/services/builtin-tools/tools/codex-utils.ts` | 补丁解析、search/replace、只读验证 |
| `apps/desktop/src/renderer/src/services/builtin-tools/tools/command-utils.ts` | ripgrep 注入、文件工具提示 |
| `apps/desktop/src/renderer/src/services/builtin-tools/grouped-tools.ts` | 工具分组注册 |
| `apps/desktop/src/renderer/src/services/builtin-tools/index.ts` | 工具聚合导出 |
| `apps/desktop/src/renderer/src/services/builtin-tools/components/codex/codexUtils.ts` | Render 共享辅助函数 |
| `apps/desktop/src/renderer/src/services/builtin-tools/components/codex/*.vue` | 6 个 Render 组件 |
| `apps/desktop/src/renderer/src/services/builtin-tools/tools/general-tools.ts` | `multi_tool_use_parallel` 动态分发 |
| `apps/desktop/src/preload/index.ts` | Preload bridge (`window.api.*`) |
| `apps/desktop/src/main/services/hashline.ts` | 主进程 hashline 读取/快照 |
| `apps/desktop/src/main/services/searchReplace.ts` | 主进程文件编辑（replace/hashline/add/delete/move） |
| `packages/types/src/ai.ts` | `Tools` 类型定义 |
| `packages/types/src/agent.ts` | `Agent.builtinToolConfigs.edit_file.mode` 类型 |
| `apps/desktop/tsconfig.web.json` | `@renderer/*` 别名配置 |

## 10. 验证

- 新增/修改工具后确认 `getCodexBuiltinTools` 返回值包含新工具
- 确认 `grouped-tools.ts` 中注册了新的工具组或新工具
- 确认 `Tools` 类型兼容新工具的 `execute` 签名
- `pnpm --filter desktop typecheck` 通过
- 如有 render 组件，确认在 `dynamic-tool.vue` 中能正确渲染
