---
name: agent-qi-app-dev-zh
description: 面向 Agent-Qi / agent-qi-electron 应用本体开发的中文技能。涉及内置智能体的新增、修改、删除、类型定义、Store CRUD、多智能体系统、Agent 工具、创建模态框、UI 组件时，必须使用此技能。
---

# 内置智能体链路

内置智能体定义在 JSON 文件中，通过 TypeScript 加载到 Pinia store 持久化、选择和用于聊天。整体链路分五层：定义层 → Store 层 → UI 选择层 → 运行时层 → 多智能体层。

```
定义层
  │
  ├─► apps/desktop/src/renderer/src/agents/builtin-agents.json ── 7 个内置智能体, JSON 数据
  ├─► builtinAgents.ts
  │     ├─► import agentsData ── Vite 静态加载 JSON
  │     ├─► getBuiltinAgents() ── JSON → Agent[] 映射
  │     ├─► createBuiltinAgent() ── 添加 '内置' 标签 + 时间戳
  │     ├─► mergeBuiltinAgents() ── 持久化恢复时合并用户改动
  │     └─► BUILTIN_AGENT_IDS ── 保护 Set, 防止删除
       │
       ▼
Store 层 (agent.ts)
  │
  ├─► useAgentStore ── Pinia, persist: ['agents']
  │     ├─ agents ├─ persistent
  │     ├─ tempAgents ── 临时, 不持久化
  │     ├─ allAgents ── 合并计算
  │     ├─ createAgent/updateAgent/deleteAgent/cloneAgent
  │     ├─ getMcpByAgent ── 解析 MCP 绑定
  │     ├─ replaceAgents ── 设备同步
  │     └─ ensureBuiltinAgents ── 启动时 reconcile
  │
  └─► chatsStore.agentId ── 对话 ↔ 智能体绑定
       │
       ▼
UI 选择层
  │
  ├─► AgentSelector.vue ── 聊天头部的智能体选择器
  ├─► agents.vue ── 设置页的智能体管理
  └─► useAgent.tsx ── 创建/编辑模态框 (9 个 Tab)
       │
       ▼
运行时层
  │
  ├─► agent-tools.ts ── agentCreator / delegate_to_sub_agent / finish_sub_task 等
  ├─► general-tools.ts ── 工具动态分发
  ├─► chatService/index.ts ── 创建代理时注入 Agent 配置
  └─► systemPrompts.ts ── 构建多智能体系统提示词
       │
       ▼
多智能体层
  │
  ├─► 主智能体 ── 可调用 delegate_to_sub_agent 分派任务
  └─► 子智能体 ── 必须调用 finish_sub_task 提交结果
```

## 1. 数据模型

`packages/types/src/agent.ts` — 全局 `Agent` 接口：

```ts
interface Agent {
  id: string
  name: string
  description?: string
  tags?: string[]
  systemPrompt: string
  mcpServers: string[]           // MCP 服务器名称列表
  tools: string[]                // 工具列表, 格式 "server.tool"
  builtinTools: string[]         // 内置工具名称列表
  builtinToolsRequireApproval?: string[]  // 需批准的内置工具
  builtinToolConfigs?: {         // 工具级配置
    computer_use?: { screenshotMaxSidePx?: number }
    edit_file?: { mode?: 'hashline' | 'replace' }
    [toolName: string]: Record<string, unknown> | undefined
  }
  execCommandRunInBackground?: boolean
  allowedSubAgents?: string[]    // 允许调用的子智能体, 空=全部
  icon?: string
  avatar?: string
  createdAt: number
  updatedAt: number
  knowledgeBaseIds?: string[]
  ragEnabled?: boolean
  workPath?: string
  skillDirectory?: string
  builtinSkills?: string[]       // 默认启用的技能
  enabledSkills?: string[]       // 用户手动启用的非默认技能
  disabledSkills?: string[]      // 禁用的技能
  backgrounds?: AgentBackground[]
  temperature?: number
  topP?: number
  topK?: number
  presencePenalty?: number
  frequencyPenalty?: number
  maxOutputTokens?: number
  contextCount?: number
  contextTokenCount?: number
  autoCompressContext?: boolean
  compressModel?: { providerId: string; modelId: string }
  enableCodexEnvContext?: boolean
  maxToolCalls?: number
  retryAutoEnabled?: boolean
  retryIntervalMs?: number
  speechVoice?: string
  speechMode?: 'sentence' | 'paragraph' | 'full'
  speechSpeed?: number
  speechLanguage?: string
  speechProviderOptions?: Record<string, unknown>
  speechModel?: { providerId: string; modelId: string }
  defaultModel?: { providerId: string; modelId: string }
}
```

## 2. 内置智能体定义

所有内置智能体数据定义在 JSON 文件：`apps/desktop/src/renderer/src/agents/builtin-agents.json`

加载链路（`apps/desktop/src/renderer/src/stores/builtinAgents.ts`）：

```
builtin-agents.json  ── Vite 静态 import ──► agentsData
                                                    │
                                          builtinAgents.ts
                                                    │
                                          getBuiltinAgents()
                                                    │
                                          createBuiltinAgent() ── 注入 '内置' 标签 + 时间戳
```

### JSON 数据格式

```json
[
  {
    "id": "builtin-my-agent",
    "name": "我的智能体",
    "description": "功能描述",
    "tags": [],
    "systemPrompt": "你的系统提示词...",
    "mcpServers": [],
    "tools": [],
    "builtinTools": ["tool1", "tool2"],
    "builtinSkills": ["skill-name"],
    "builtinToolsRequireApproval": [],
    "builtinToolConfigs": {},
    "execCommandRunInBackground": false,
    "knowledgeBaseIds": [],
    "temperature": 0.5,
    "topP": 1,
    "topK": 40,
    "presencePenalty": 0,
    "frequencyPenalty": 0,
    "maxOutputTokens": 0,
    "contextCount": 0,
    "contextTokenCount": 0,
    "maxToolCalls": 0,
    "speechSpeed": 1,
    "speechLanguage": "auto"
  }
]
```

### TypeScript 侧加载逻辑

```ts
import agentsData from '@renderer/agents/builtin-agents.json'

type BuiltinAgentJson = Omit<Agent, 'createdAt' | 'updatedAt' | 'speechModel'> & {
  createdAt?: number
  updatedAt?: number
  speechModel?: { providerId: string; modelId: string }
}

const createBuiltinAgent = (
  agent: Omit<Agent, 'createdAt' | 'updatedAt'> & { createdAt?: number; updatedAt?: number }
): Agent => {
  return {
    ...agent,
    tags: [...new Set([BUILTIN_AGENT_TAG, ...(agent.tags || [])])],
    createdAt: agent.createdAt || Date.now(),
    updatedAt: agent.updatedAt || Date.now()
  }
}

export const getBuiltinAgents = (): Agent[] => {
  return (agentsData as unknown as BuiltinAgentJson[]).map(createBuiltinAgent)
}
```

- `createBuiltinAgent` 自动为所有内置智能体添加 `'内置'` 标签
- `default` 智能体额外添加 `'默认'` 标签（在 JSON 的 `tags` 中声明）

### 现有 6 个内置智能体

| ID | 名称 | 描述 | 关键内置工具 | 关键技能 |
|----|------|------|-------------|---------|
| `default` | 默认助手 | 通用AI助手 | 无 | 无 |
| `builtin-skill-manager` | 技能管理 | 发现、安装、创建、更新和整理技能 | `loadSkill`, `readFile`, `edit_file`, `exec_command`, `fetch`, 等 | `skill-creator`, `find-skills` |
| `builtin-canvas` | Canvas | Canvas 工作区操作 | `list_canvas_directory`, `read_canvas_file`, `edit_file_canvas`, 等 | 无 |
| `builtin-agent-creator` | 智能体创建 | 根据目标创建新智能体 | `agentCreator`, `loadSkill` | 无 |
| `builtin-codex` | Codex | 项目代码编程 | `multi_tool_use_parallel`, `readFile`, `edit_file`, `exec_command`, 等 | `codegraph`, `agent-browser` |
| `builtin-notes` | 笔记 | 管理、检索和编辑笔记 | `list_notes`, `manage_note`, `edit_note` | 无 |

### 新增内置智能体

在 `apps/desktop/src/renderer/src/agents/builtin-agents.json` 的 JSON 数组中新增一项即可，无需修改 TypeScript 代码。

**约定**：
- `id` 使用 `builtin-` 前缀 + 英文短横线命名，必须是稳定的、唯一的
- `systemPrompt` 直接嵌入 JSON 的字符串中（JSON 支持转义换行符 `\n`）
- `tags` 只填额外标签，`'内置'` 标签由 `createBuiltinAgent` 自动注入
- `builtinSkills` 配置默认启用的技能名；存在时其他技能默认关闭（用户在 UI 中可通过 `enabledSkills`/`disabledSkills` 调整）
- 不需要填 `createdAt`/`updatedAt`/`speechModel`，这些由 TypeScript 运行时处理

### 保护机制

```ts
export const BUILTIN_AGENT_IDS = new Set(getBuiltinAgents().map((a) => a.id))
// Set = {'default', 'builtin-skill-search', 'builtin-skill-creator', ...}
```

- `BUILTIN_AGENT_IDS` 是一个 `Set<string>`，用于防止删除
- `deleteAgent(id)` 检查该 Set，内置智能体不可删除
- `ensureBuiltinTags()` 确保内置智能体的 `tags` 始终与规范定义一致
- `mergeBuiltinAgents()` 合并时以规范定义的 `tags`、`builtinSkills` 为准，同时保留用户对其他字段的改动

## 3. 持久化与恢复

### 启动恢复

```ts
// agent.ts
export const useAgentStore = defineStore('agent', () => {
  const agents = ref<Agent[]>(getBuiltinAgents())  // 初始化为内置
  // ...
}, {
  persist: {
    paths: ['agents'],
    afterRestore: (context) => {
      const store = context.store
      store.ensureBuiltinAgents()  // 恢复后 reconcile
    }
  }
})
```

### mergeBuiltinAgents

```ts
export const mergeBuiltinAgents = (currentAgents: Agent[]): Agent[] => {
  const builtinAgents = getBuiltinAgents()
  const builtinById = new Map(builtinAgents.map((a) => [a.id, a]))
  const seen = new Set<string>()
  const merged = currentAgents.map((agent) => {
    seen.add(agent.id)
    const builtin = builtinById.get(agent.id)
    if (!builtin) return agent  // 自定义智能体, 原样保留
    return {
      ...builtin,              // 以规范定义为基础
      ...agent,                // 保留用户自定义
      tags: builtin.tags,      // 标签强制使用规范定义
      builtinSkills: builtin.builtinSkills,
      builtinToolConfigs: {
        ...(builtin.builtinToolConfigs || {}),
        ...(agent.builtinToolConfigs || {})
      }
    }
  })
  const missingBuiltinAgents = builtinAgents.filter((a) => !seen.has(a.id))
  return [...merged, ...missingBuiltinAgents]
}
```

**关键点**：
- 内置智能体以规范定义为基准，`tags`、`builtinSkills` 不可被用户覆盖
- `builtinToolConfigs` 是深度合并（规范定义 + 用户自定义）
- 缺失的内置智能体会自动补回
- 新增内置智能体后，老用户的持久化数据会自动包含新智能体

## 4. Agent Store CRUD

`apps/desktop/src/renderer/src/stores/agent.ts`

| 方法 | 作用 | 注意事项 |
|------|------|---------|
| `createAgent(data)` | 创建新智能体（自动生成 id/timestamp） | |
| `updateAgent(id, updates)` | 更新智能体字段 | 支持更新 `agents` 和 `tempAgents` |
| `deleteAgent(id)` | 删除智能体 | 内置智能体不可删除 |
| `cloneAgent(id)` | 克隆智能体 | 克隆后剥离 `'内置'`/`'默认'` 标签 |
| `getAgentById(id)` | 通过 ID 查找 | 同时搜索 `agents` + `tempAgents` |
| `getMcpByAgent(id)` | 解析 MCP 绑定 | 支持智能体级白名单 |
| `replaceAgents(newAgents)` | 设备同步时全量替换 | 自动调用 `mergeBuiltinAgents` |
| `ensureBuiltinAgents()` | reconcile 内置智能体 | 启动时和持久化恢复后调用 |
| `isBuiltinAgent(id)` | 判断是否为内置 | 基于 `BUILTIN_AGENT_IDS` |
| `addTempAgent(agent)` | 添加临时智能体（不持久化） | 显示 `(临时)` 标记 |

### tempAgents

```ts
const tempAgents = ref<Agent[]>([])  // 不持久化

const allAgents = computed(() => [...agents.value, ...tempAgents.value])
```

- 用于插件注入或外部来源的瞬态智能体
- 不参与 `persist`，应用关闭后丢失
- 在 UI 中显示 `(临时)` 标记（`AgentSelector.vue` 第 281 行）

## 5. Agent 工具

`apps/desktop/src/renderer/src/services/builtin-tools/tools/agent-tools.ts`

### getAgentBuiltinTools(skills) 返回的工具集

| 工具名 | 工具用途 | 使用场景 |
|--------|----------|---------|
| `agentCreator` | LLM 创建新智能体 | `builtin-agent-creator` 使用 |
| `delegate_to_sub_agent` | 主智能体异步分派子任务 | 多智能体协作 |
| `finish_sub_task` | 子智能体提交结果 | 子智能体必须调用 |
| `mcp_installer` | 自动安装 MCP 服务器 | 运行时动态添加 MCP |
| `compress_context` | 由 LLM 调用压缩上下文 | token 管理 |
| `loadSkill` | 加载技能文件 | 动态技能发现 |

### agentCreator 执行流程

1. 验证名称唯一性
2. 校验 `mcpServers` / `builtinTools` / `tools` / `knowledgeBaseIds` / `skills` 是否存在
3. 校验 `builtinToolsRequireApproval` 是 `builtinTools` 子集
4. 计算 `disabledSkills`（未启用的非默认技能）
5. 调用 `agentStore.createAgent()`
6. 返回完整的创建摘要

### 多智能体工具流

```
主智能体
  │
  ├─ delegate_to_sub_agent({ task, agentName, inheritContext, switchToSubChat })
  │    │
  │    ├─ 创建子会话 (createSubChat)
  │    ├─ 设置子智能体系统提示词
  │    ├─ 异步启动 useChat(subChatId).sendMessages(childPrompt)
  │    └─ 立即返回, 不阻塞
  │
  ▼
子智能体
  │
  └─ finish_sub_task({ mode: 'last_message' | 'custom', message? })
       │
       ├─ 更新子任务状态为 completed/failed
       ├─ 提交结果到主会话的 pendingMessages
       └─ 主智能体收到子智能体总结后继续推理
```

## 6. 智能体创建模态框

`apps/desktop/src/renderer/src/composables/useAgent.tsx`

`openAgentModal(agent?)` 打开创建/编辑模态框，包含 9 个 Tab：

| Tab | 字段 | 说明 |
|-----|------|------|
| 基本信息 | `defaultModel`, `avatar`, `name`, `description`, `systemPrompt` | |
| 模型参数 | `temperature`, `topP`, `topK`, `presencePenalty`, `frequencyPenalty`, `maxOutputTokens` | 含重置按钮 |
| 语音配置 | `speechModel`, `speechVoice`, `speechMode`, `speechSpeed`, `speechLanguage` | + provider 动态字段 |
| 内置工具 | `builtinTools` + 工具级配置 | 支持设置需批准、exec_command 后台、edit_file 模式等 |
| MCP 服务 | `mcpServers`, `tools` | 选项联动 |
| 技能配置 | `skillDirectory`, 技能启/禁用、创建/编辑/删除 | 含右键菜单 |
| 知识库 | `knowledgeBaseIds`, `ragEnabled` | |
| 外观设置 | `backgrounds` | 背景图 |
| 高级设置 | `contextCount`, `contextTokenCount`, `autoCompressContext`, `maxToolCalls`, `retryAutoEnabled`, `workPath`, `enableCodexEnvContext` | |

### 工具级配置模态框

内置工具右侧的「配置」按钮打开子模态框，支持：
- `requireApproval` — 是否需手动批准
- `screenshotMaxSidePx` — computer_use 截图分辨率
- `execCommandRunInBackground` — 后台静默执行
- `editFileMode` — 编辑模式 (`replace` / `hashline`)
- `allowedSubAgents` — delegate_to_sub_agent 白名单

## 7. UI 组件

### AgentSelector.vue

`apps/desktop/src/renderer/src/pages/chat/AgentSelector.vue`

- 聊天头部的智能体选择器（支持 `type: 'icon' | 'select'` 两种模式）
- 支持搜索、收藏（`favoriteAgentIds`）
- 智能体分「收藏」和「全部」两组显示
- 右键上下文菜单：收藏/拷贝/配置/删除（内置不可删除）
- `selectAgent(agentId)` → `chatsStore.setChatAgent(chatId, agentId)`

### agents.vue

`apps/desktop/src/renderer/src/pages/settings/agents.vue`

- 设置页的智能体网格管理
- 每个智能体卡片显示头像、名称、标签、描述
- 编辑/删除操作（内置不可删除）
- 右上角「创建智能体」按钮

## 8. 多智能体系统

`apps/desktop/src/renderer/src/services/chatService/systemPrompts.ts`

### 三种系统提示词构建

| 函数 | 用途 |
|------|------|
| `buildMultiAgentSystemPrompt(cid)` | 入口：检测是否有 `parentChatId`，判断是主智能体还是子智能体 |
| `buildSubAgentSystemPrompt(chat)` | 子智能体：告知执行任务，必须调用 `finish_sub_task` |
| `buildMasterAgentSystemPrompt(chat)` | 主智能体：列出可用子智能体和当前子会话列表 |

### allowedSubAgents 过滤

```ts
if (allowedSubAgents && allowedSubAgents.length > 0) {
  availableAgents = availableAgents.filter((agent) =>
    allowedSubAgents.includes(agent.name)
  )
}
```

- 主智能体仅能分派 `allowedSubAgents` 白名单中的智能体
- 空列表表示允许所有智能体

### Codex 环境上下文

```ts
export const buildCodexEnvironmentPrompt = (chatId, builtinTools): string => {
  // 检测是否有 Codex 内置工具
  // 注入 <cwd>, <shell>, <current_date>, <timezone>
}
```

仅在 `builtinTools` 包含 Codex 工具且 `enableCodexEnvContext` 为 `true` 时注入。

## 9. 设备同步

`apps/desktop/src/renderer/src/stores/sync.ts`

- `buildLocalSnapshot()` 包含 `agents: agentStore.agents`
- 深度监听 `agentStore.agents`，变更时发布
- 接收端 `agentStore.replaceAgents(snapshot.agents || [])`
- `replaceAgents` → `mergeBuiltinAgents` → 确保内置定义最新

## 10. 验证清单

新增或修改内置智能体后检查：

- JSON 文件语法有效（可用 `node -e "JSON.parse(fs.readFileSync('...'))"` 验证）
- JSON 中的必填字段完整（`id`, `name`, `systemPrompt`, `builtinTools`, `mcpServers`, `tools` 等）
- `getBuiltinAgents()` 返回的新智能体字段完整
- `BUILTIN_AGENT_IDS` 自动包含新 ID
- 持久化恢复后 `ensureBuiltinAgents()` 能正确合并
- 新智能体在 `AgentSelector.vue` 中可见，且带 `'内置'` 标签
- 新智能体在设置页 `agents.vue` 中不可删除
- 新智能体克隆后剥离 `'内置'` 标签
- `agentCreator` 工具能正确创建包含新字段的智能体
- `delegate_to_sub_agent` 的 `allowedSubAgents` 能正确过滤
- 多智能体系统提示词正确注入
- `pnpm --filter desktop typecheck` 通过

## 常见源码入口

| 文件 | 职责 |
|------|------|
| `packages/types/src/agent.ts` | `Agent` 类型定义 |
| `apps/desktop/src/renderer/src/agents/builtin-agents.json` | 内置智能体数据（JSON 数组，新增/修改直接编辑此文件） |
| `apps/desktop/src/renderer/src/stores/builtinAgents.ts` | JSON → Agent 加载、`mergeBuiltinAgents`、`ensureBuiltinTags` |
| `apps/desktop/src/renderer/src/stores/agent.ts` | Agent Pinia store (CRUD/持久化/sync) |
| `apps/desktop/src/renderer/src/services/builtin-tools/tools/agent-tools.ts` | agentCreator / delegate_to_sub_agent / finish_sub_task 等 |
| `apps/desktop/src/renderer/src/composables/useAgent.tsx` | 创建/编辑智能体模态框 (9 Tab) |
| `apps/desktop/src/renderer/src/pages/chat/AgentSelector.vue` | 聊天智能体选择器 |
| `apps/desktop/src/renderer/src/pages/settings/agents.vue` | 设置页智能体管理 |
| `apps/desktop/src/renderer/src/services/chatService/systemPrompts.ts` | 多智能体系统提示词 |
| `apps/desktop/src/renderer/src/stores/chats.ts` | `chat.agentId` 对话-智能体绑定 |
| `apps/desktop/src/renderer/src/stores/settings.ts` | `favoriteAgentIds` 收藏 |
| `apps/desktop/src/renderer/src/stores/sync.ts` | 设备间智能体同步 |
| `apps/desktop/src/renderer/src/prompts/agentqi-codex-programming-prompt.md` | Codex 智能体系统提示词 |
| `apps/desktop/src/renderer/src/prompts/agentqi-skill-manager-prompt.md` | 技能管理智能体系统提示词 |
| `apps/desktop/src/renderer/src/prompts/agentqi-skill-creator-prompt.md` | （已废弃，由 skill-manager 替代） |
