---
name: agent-qi-app-dev-zh
description: 面向 Agent-Qi / agent-qi-electron 应用本体开发的中文技能。修改桌面端 Electron/Vue 应用代码时触发。涉及 MCP 客户端管理、工具调用链路、传输层配置、智能体-MCP 绑定时必须使用此技能。
---

# MCP 客户端链路

项目只实现 **MCP 客户端**（无服务端），通过 `@ai-sdk/mcp` + `@modelcontextprotocol/sdk` 连接外部 MCP 服务器。整体链路分三层：渲染进程 → Preload（contextBridge）→ 外部 MCP 服务器。

## 1. 整体架构

```
渲染进程 (Vue.js)
  settings/mcp.vue  ── CRUD 服务器配置 ──► settings store (Pinia)
  useChat.ts ── getMcpByAgent() ──► agent store ──► mcpClient + mcpTools
       │
       ▼
  chatService/index.ts ── 缓存命中? ──[未命中]──► window.api.list_tools(config)
                                                      │ contextBridge
═══════════════════════════════════════════════════════╧══════════════════
Preload 脚本
  preload/services/ai/index.ts
    syncClients(config)
      ├─ 关闭已移除的客户端
      └─ 创建/更新客户端（配置变化检测）
           │
           ▼
    createMCPClient({ transport })  ── @ai-sdk/mcp
           │
           ├─ StdioClientTransport         (本地进程)
           ├─ StreamableHTTPClientTransport (远程 HTTP)
           └─ SSEClientTransport           (远程 SSE)
                │
                ▼
          外部 MCP 服务器
```

## 2. 传输层配置

三种传输类型在 `preload/services/ai/index.ts` 的 `createTransport(cfg)` 中实现：

| 类型 | Transport 类 | 用途 | 关键配置字段 |
|------|-------------|------|-------------|
| `stdio` | `StdioClientTransport` | 本地 npx 包、Python 脚本 | `command`, `args`, `env` |
| `http` | `StreamableHTTPClientTransport` | 远程流式 HTTP | `url`, `headers` |
| `sse` | `SSEClientTransport` | 远程 Server-Sent Events | `url`, `headers` |

源码入口：`apps/desktop/src/preload/services/ai/index.ts`（`createTransport` 函数）

## 3. 客户端生命周期管理（syncClients）

`syncClients(config)` 是 MCP 客户端核心引擎，实现增量同步：

- **clientMap**：`Record<string, MCPClient>` 追踪所有活跃客户端
- 关闭已从配置中移除的客户端（调用 `client.close()`）
- 仅当配置关键字段变化时才重建客户端（浅比较 `command`, `args`, `url`, `transport`, `headers`）
- 每个服务器配置创建一个独立的 `MCPClient` 实例

```ts
// 关键字段比较，避免无关字段变化触发重建
const isNecessaryConfigChanged = (oldCfg: ServerConfig, newCfg: ServerConfig) => {
  const fields: (keyof ServerConfig)[] = ['command', 'args', 'url', 'transport', 'headers']
  return fields.some(f => !isEqual(oldCfg[f], newCfg[f]))
}
```

## 4. 资源发现与读取

MCP Resources 是 MCP 协议中与 Tools 并列的核心概念，代表服务器暴露的**数据资源**（文档、文件、数据库记录等），由用户手动选择后作为上下文注入给 AI 模型。

### 4.1 资源类型定义

```ts
// packages/types/src/ai.ts
interface MCPResourceInfo {
  uri: string          // 资源唯一标识
  name: string         // 资源名称
  title?: string       // 显示标题
  description?: string // 描述
  mimeType?: string    // MIME 类型
  size?: number        // 大小（字节）
  serverName: string   // 所属 MCP 服务器名
}

interface MCPResourceContent {
  uri: string
  mimeType?: string
  text?: string        // 文本内容
  blob?: string        // 二进制内容（base64）
}

interface MCPReadResourceResult {
  contents: MCPResourceContent[]
}

interface MCPResourceTemplate {
  uriTemplate: string  // URI 模板（如 `file://{path}`）
  name: string
  title?: string
  description?: string
  mimeType?: string
  serverName: string
}
```

### 4.2 Preload 层实现（`preload/services/ai/index.ts`）

四个 IPC 方法：

- **`list_mcp_resources(config, cache?)`** — 遍历所有活跃客户端，调用 `client.listResources()`，合并各服务器返回的资源列表，按 `JSON.stringify(lastConfig)` 缓存
- **`read_mcp_resource(config, serverName, uri)`** — 按 `serverName` 查找客户端，调用 `client.readResource({ uri })`，返回资源内容。聊天时优先走 store 缓存，未命中时 fallback 到本方法
- **`list_mcp_resource_templates(config, cache?)`** — 遍历所有活跃客户端，调用 `client.listResourceTemplates()`，合并返回 URI 模板列表
- **`cache_all_mcp_resources(config)`** — 遍历所有活跃客户端，逐一调用 `client.readResource()` 读取**全部资源的内容**，按 `"serverName::uri"` 为键返回 `Record<string, ReadResourceResult>`。由前端调用方将结果写入 store

```ts
// preload/services/ai/index.ts
let resourcesCache: ResourceInfo[] | undefined
let templatesCache: ResourceTemplateInfo[] | undefined

const list_mcp_resources = async (config, cache = true) => {
  if (resourcesCache && JSON.stringify(lastConfig) === JSON.stringify(config) && cache) {
    return resourcesCache
  }
  await syncClients(config)
  const results = await Promise.allSettled(
    Object.entries(clientMap).map(async ([serverName, client]) => {
      const { resources } = await client.listResources()
      return (resources || []).map(r => ({ uri, name, title, description, mimeType, size, serverName }))
    })
  )
  resourcesCache = results.flatMap(r => r.status === 'fulfilled' ? r.value : [])
  return resourcesCache
}
```

### 4.3 渲染层 IPC 桥接（`packages/types/src/electron.ts`）

```ts
interface ElectronAPI {
  list_mcp_resources: (config: ClientConfig, cache?: boolean) => Promise<MCPResourceInfo[]>
  read_mcp_resource: (config: ClientConfig, serverName: string, uri: string) => Promise<MCPReadResourceResult>
  list_mcp_resource_templates: (config: ClientConfig, cache?: boolean) => Promise<MCPResourceTemplate[]>
}
```

### 4.4 资源内容预缓存（store 层）

资源内容预取后存入 Pinia store 的独立字段 `mcpResourceCache`（双层 map，`Record<serverName, Record<uri, content>>`），与 `mcpServers` 中的服务器参数分离，但同样持久化到 IndexedDB：

```ts
// settings store 中独立字段，不挂在 mcpServers[name] 上
mcpResourceCache: {
  "server-a": {
    "file:///doc1.md": { contents: [...] },
    "file:///doc2.md": { contents: [...] }
  },
  "server-b": {
    "db://users/123": { contents: [...] }
  }
}
```

写入流程：

```
cache_all_mcp_resources(config)
  │ 返回 { "serverA::uri1": content, "serverA::uri2": content, ... }
  ▼
fetchResources (mcp.vue)
  │ 拆解 key，按 serverName / uri 写入
  ▼
settingsStore.mcpResourceCache[serverName][uri] = content
```

缓存时机：

- **激活服务器时**：`toggleActive` 在成功获取工具列表后自动调用 `fetchResources` 预取全部资源内容
- **手动刷新**：设置页中已启用服务器旁的 `FileCode` 按钮可手动触发重新缓存
- **聊天时**：`useChat.ts` 优先从 `settingsStore.mcpResourceCache[serverName][uri]` 读取，命中则直接使用，**无需 IPC 调用**；未命中时 fallback 到 `window.api.read_mcp_resource()`

### 4.5 资源选择 UI（`McpResourceSelector.vue`）

`apps/desktop/src/renderer/src/pages/chat/message/Input/McpResourceSelector.vue` 提供资源选择弹窗：

- 点击输入区的 📄 图标打开 `SelectorPopover`
- 加载当前智能体绑定的 MCP 服务器所暴露的所有资源
- 按 `serverName` 分组展示，支持全选/取消单个
- 选中后调用 `updateChatMcpResources()` 写入 `ChatSummary.selectedMcpResources`
- 支持恢复之前的选择（通过 `restoreSelection()`）

```ts
// 选中状态持久化格式
// ChatSummary.selectedMcpResources: Record<string, string[]>
{
  "server-a": ["file:///doc1.md", "file:///doc2.md"],
  "server-b": ["db://users/123"]
}
```

### 4.6 资源注入聊天上下文（`useChat.ts`）

在 `sendMessages` 时，读取 `runtimeChat.selectedMcpResources`，遍历每条选中的资源并调用 `window.api.read_mcp_resource()` 获取内容，拼接成上下文文本注入到 `agentInstructions` 中：

```
以下是用户选中的 MCP 资源内容，作为本次对话的上下文参考：
---
[server-a] file:///doc1.md
{document content...}
[server-b] db://users/123
{query result...}
---
```

注入流程：

```
runtimeChat.selectedMcpResources
  │
  ▼ 遍历 {serverName → uri[]}
window.api.read_mcp_resource(config, serverName, uri)
  │
  ▼ 拼接文本
mcpResourceContent ──► chatService.createAgent({ instructions: mcpResourceContent })
                              │
                              ▼
                    agentInstructions = [codexEnv, systemPrompt, skills, mcpResourceContent].join('\n\n')
```

### 4.7 智能体资源白名单

`Agent` 类型中 `mcpResources` 字段用于声明该智能体允许访问的 MCP 资源：

```ts
interface Agent {
  mcpResources?: string[] // 格式 "serverName::uri"
}
```

目前该字段已定义但暂未在前端 UI 中展示，资源选择由用户通过 `McpResourceSelector` 按会话（Chat）级别手动选择，而非按智能体预置。

### 4.8 数据流全景

```
┌─ 预缓存阶段（激活/刷新时） ──────────────────────────────────────────────┐
│ settings.mcp.vue                                                          │
│   toggleActive(server)  ────► fetchTools()    ──► 缓存工具列表             │
│   fetchResources(server) ────► cache_all_mcp_resources()                   │
│                                  │ 返回 { "srv::uri": content }            │
│                                  ▼                                         │
│                           拆解写入 store                                    │
│                     mcpServers[name].resourceContents[uri]                 │
└────────────────────────────────────────────────────────────────────────────┘

┌─ 聊天阶段 ────────────────────────────────────────────────────────────────┐
│ McpResourceSelector.vue              useChat.ts                            │
│         │                                    │                             │
│  list_mcp_resources()                 读取 selectedMcpResources            │
│         │                                    │                             │
│  展示资源列表 ◄──────                  settingsStore.mcpServers             │
│  用户勾选选中                          [name].resourceContents[uri]        │
│         │                                    │                             │
│         ▼                              ┌────▼────┐                        │
│  ChatSummary.selectedMcpResources ──►  │  缓存命中?│                        │
│                                         │         │                        │
│                                     是──┤         ├──否                    │
│                                         │         │                        │
│                                   直接使用    read_mcp_resource()           │
│                                         │         │                        │
│                                         ▼         ▼                        │
│                                    拼接 MCP 资源上下文                     │
│                                         │                                  │
│                                   chatService.createAgent(                 │
│                                     instructions: mcpResourceContent        │
│                                   )                                        │
└────────────────────────────────────────────────────────────────────────────┘
```

## 5. 工具发现与缓存

### Preload 层缓存

`list_tools(config, cache)` 在 `preload/services/ai/index.ts` 中：
- 通过 `syncClients` 同步客户端
- 收集所有客户端的 `.tools()`
- 合并成一个工具映射，按 `JSON.stringify(lastConfig)` 缓存（键为配置快照）

### 渲染层缓存

`chatService/index.ts` 中有 5 分钟 TTL 缓存：
```ts
const mcpToolsCache = new Map<string, { tools: ToolSet; timestamp: number }>()
```
- key 为 `JSON.stringify(mcpClient)`
- 命中且未过期则直接使用，否则调用 `window.api.list_tools()`
- 内置重试机制（3 次尝试，100ms 延迟）

## 8. 智能体-MCP 绑定

### 配置模型

```ts
// packages/types/src/agent.ts
interface Agent {
  mcpServers: string[]   // 允许的 MCP 服务器名称列表（空=全部）
  tools: string[]        // 格式 "serverName.toolName" 的工具白名单
}

// packages/types/src/settings.ts
interface SettingsState {
  mcpServers: Record<string, ServerConfig>  // 完整服务器配置
}
```

### 解析逻辑（agent.ts `getMcpByAgent`）

1. 如果 `agent.mcpServers` 为空数组 → 使用 settings 中 **所有** 活跃的 MCP 服务器
2. 如果 `agent.mcpServers` 有值 → 只包含这些命名的活跃服务器
3. 返回 `{ mcpServers: ClientConfig }` 给聊天服务

## 9. 工具注入与执行

### 聊天初始化链路

```
useChat.ts ──► agentStore.getMcpByAgent() ──► mcpClient + mcpTools
    │
    ▼
chatService.createAgent(config)
    │
    ├─ list_tools(mcpClient)  ── 获取所有 MCP 服务器工具
    ├─ 按 mcpTools 白名单过滤（格式 "serverName.toolName"，按 . 拆分匹配）
    └─ 注入到 AI SDK 的 tools 参数
```

### 动态工具调用（general-tools.ts）

内置工具 `call_mcp_tool` 允许 LLM 动态调用 MCP 工具：
- 寻址格式：`mcp.serverName.toolName`
- 先验证是否在 `agent.tools` 白名单中
- 再解析配置、获取工具实例、调用 `tool.execute()`
- 返回格式化输出

## 10. 设置页面数据结构

`settings/mcp.vue` 中每个服务器配置：

```ts
interface ServerConfig {
  name: string
  transport: 'stdio' | 'http' | 'sse'
  command?: string     // stdio
  args?: string[]      // stdio
  env?: Record<string, string>  // stdio
  url?: string         // http / sse
  headers?: Record<string, string>  // http / sse
  active?: boolean     // UI 切换开关
  tools?: ToolSet      // 激活后获取的工具列表
}
```

- 切换 `active` 时触发工具获取和资源内容预缓存（`fetchTools` + `fetchResources`）
- 已启用服务器旁有 **刷新工具**（Refresh 图标）和 **刷新资源内容**（FileCode 图标）两个按钮
- 支持原始 JSON 编辑模式

## 11. 常见源码入口

| 文件 | 职责 |
|------|------|
| `apps/desktop/src/preload/services/ai/index.ts` | MCP 客户端引擎（同步/创建/调用 + 资源内容缓存） |
| `apps/desktop/src/renderer/src/pages/settings/mcp.vue` | MCP 服务器管理 UI（含资源刷新按钮） |
| `apps/desktop/src/renderer/src/stores/settings.ts` | 设置 store（持久化 mcpServers） |
| `apps/desktop/src/renderer/src/stores/agent.ts` | `getMcpByAgent()` 解析智能体绑定 |
| `apps/desktop/src/renderer/src/services/chatService/index.ts` | 工具缓存 + 代理创建时注入 |
| `apps/desktop/src/renderer/src/services/builtin-tools/tools/general-tools.ts` | `call_mcp_tool` 内置工具 |
| `apps/desktop/src/renderer/src/services/builtin-tools/tools/agent-tools.ts` | 跨智能体 MCP 委托 |
| `apps/desktop/src/renderer/src/services/chatService/registry.ts` | Zod schema 验证 |
| `apps/desktop/src/renderer/src/composables/useChat.ts` | 聊天初始化，资源注入，传递 mcpClient |
| `apps/desktop/src/renderer/src/pages/chat/message/Input/McpResourceSelector.vue` | MCP 资源选择弹窗 UI |
| `apps/desktop/src/renderer/src/pages/chat/AgentSelector.vue` | 显示智能体的 MCP 工具计数 |
| `packages/types/src/ai.ts` | MCP 资源/模板类型定义 |
| `packages/types/src/agent.ts` | Agent 类型定义（含 mcpResources） |
| `packages/types/src/chats.ts` | Chat/ChatSummary 类型定义（含 selectedMcpResources） |
| `packages/types/src/electron.ts` | ElectronAPI IPC 类型定义 |
| `packages/types/src/settings.ts` | SettingsState 类型定义 |
| `apps/desktop/src/renderer/src/services/chatService/types.ts` | ChatServiceConfig 类型定义（含 mcpResourceContent） |
| `apps/desktop/package.json` | 依赖 `@ai-sdk/mcp`, `@modelcontextprotocol/sdk` |

## 12. 验证

- 新增 MCP 服务器配置后刷新，配置持久化保留
- 切换服务器 active 开关能正确获取工具列表
- 智能体绑定的 MCP 服务器在聊天中生效（工具可被 AI 调用）
- 点击输入区 📄 按钮可弹出资源选择器，正确列出活跃服务器的资源
- 选中资源后发送消息，AI 能在上下文中看到资源内容并被正确引用
- **激活服务器时自动预取资源内容，聊天时无需二次请求 MCP 服务器**
- **点击已启用服务器旁的 FileCode 按钮可刷新资源缓存**
- 切换会话后已选的资源恢复正确
- 移除 MCP 服务器后，其资源不再显示
- 移除服务器后，客户端被正常关闭，无内存泄漏
- `pnpm --filter desktop typecheck` 通过
