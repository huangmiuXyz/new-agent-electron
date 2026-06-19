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

## 4. 工具发现与缓存

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

## 5. 智能体-MCP 绑定

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

## 6. 工具注入与执行

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

## 7. 设置页面数据结构

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

- 切换 `active` 时触发工具获取以验证连接
- 支持原始 JSON 编辑模式

## 8. 常见源码入口

| 文件 | 职责 |
|------|------|
| `apps/desktop/src/preload/services/ai/index.ts` | MCP 客户端引擎（同步/创建/调用） |
| `apps/desktop/src/renderer/src/pages/settings/mcp.vue` | MCP 服务器管理 UI |
| `apps/desktop/src/renderer/src/stores/settings.ts` | 设置 store（持久化 mcpServers） |
| `apps/desktop/src/renderer/src/stores/agent.ts` | `getMcpByAgent()` 解析智能体绑定 |
| `apps/desktop/src/renderer/src/services/chatService/index.ts` | 工具缓存 + 代理创建时注入 |
| `apps/desktop/src/renderer/src/services/builtin-tools/tools/general-tools.ts` | `call_mcp_tool` 内置工具 |
| `apps/desktop/src/renderer/src/services/builtin-tools/tools/agent-tools.ts` | 跨智能体 MCP 委托 |
| `apps/desktop/src/renderer/src/services/chatService/registry.ts` | Zod schema 验证 |
| `apps/desktop/src/renderer/src/composables/useChat.ts` | 聊天初始化，传递 mcpClient |
| `apps/desktop/src/renderer/src/pages/chat/AgentSelector.vue` | 显示智能体的 MCP 工具计数 |
| `packages/types/src/agent.ts` | Agent 类型定义 |
| `packages/types/src/settings.ts` | SettingsState 类型定义 |
| `apps/desktop/package.json` | 依赖 `@ai-sdk/mcp`, `@modelcontextprotocol/sdk` |

## 9. 验证

- 新增 MCP 服务器配置后刷新，配置持久化保留
- 切换服务器 active 开关能正确获取工具列表
- 智能体绑定的 MCP 服务器在聊天中生效（工具可被 AI 调用）
- 移除服务器后，客户端被正常关闭，无内存泄漏
- `pnpm --filter desktop typecheck` 通过
