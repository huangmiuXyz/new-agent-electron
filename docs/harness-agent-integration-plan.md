# HarnessAgent 集成方案（Pi + just-bash，主进程 + IPC 流式，新增内置智能体）

> 目标：将 [AI SDK v7 HarnessAgent](https://ai-sdk.dev/v7/docs/ai-sdk-harnesses/harness-agent) 以「新增内置智能体」形式集成进 agent-qi-electron，保留现有 `ToolLoopAgent` 架构不动，零回归。
>
> 适配器选择 **Pi**（host-runtime），沙箱选择 **just-bash**（本地沙箱），运行位置在 **Electron 主进程**，通过 **IPC** 把流式分片推给渲染进程并还原为 AI SDK UI 消息流。

---

## 一、决策记录

| 决策项 | 选择 | 备注 |
|--------|------|------|
| Harness 适配器 | **Pi**（`@ai-sdk/harness-pi`，host-runtime） | 纯本地运行，不需要云沙箱和外部 CLI 二进制 |
| 沙箱 | **`@ai-sdk/sandbox-just-bash`**（host 本地） | 备选：自定义 `HarnessV1SandboxProvider` 复用现有 PTY/hashline/editFile IPC |
| 集成形态 | **新增一个内置智能体** `builtin-pi-harness` | 保留现有 `ToolLoopAgent` 路径，零回归 |
| 运行进程 | **主进程 + IPC 流式** | HarnessAgent 需 Node runtime（spawn/端口/文件），主进程符合设计 |
| LLM 后端凭据 | **复用应用内 provider key** | `apiKey/baseURL/providerType` → Pi `auth.customEnv`；并非真正离线 LLM |
| 节奏 | **先 PoC 验证（不接 UI）** | 验证 just-bash 在 Electron 打包环境可行性后再接入 UI |
| 移动端 | **桌面专属，AgentSelector 按平台隐藏** | Capacitor 端无 Electron 主进程，跑不通 |
| 沙箱后端策略 | **先试 just-bash，不行再自定** | Plan B：自定义 SandboxProvider 复用现有 IPC |

---

## 二、关键事实与兼容性

### 2.1 现有执行链（保持不动）

```
renderer (Vue useChat)
  └─ transport.sendMessages({messages})                     useChat.ts:294
     └─ chatService.createAgent(cid, opts, messages)         chatService/index.ts:52
        └─ new ToolLoopAgent({model, tools, middleware...})  index.ts:268
           └─ agent.stream({prompt: modelMessages})          index.ts:347
              └─ result.toUIMessageStream({...})             index.ts:352
                 └─ 返回给 @ai-sdk/vue _useChat 消费          useChat.ts:289
```

**契约**：`createAgent` 返回一个 UIMessageStream，`_useChat` 消费它。

### 2.2 HarnessAgent 兼容性

- `HarnessAgent.stream()` 返回 AI SDK `StreamTextResult`，与 `ToolLoopAgent.stream()` 同构。
- `result.stream` → `toUIMessageStream({ stream })` 即可投影为 UI 消息流，被 `_useChat` 复用。
- Pi 在 host Node 进程内运行（= Electron 主进程），sandbox 仅作远程 fs/shell，不需要 Vercel 云沙箱和外部 CLI 二进制。
- Pi 内置工具：`read/write/edit/bash/grep/glob/ls`（标准 AI SDK tool part shape），另含 `dynamic-tool`（`fileChange`/`compaction` 等无对应 AI SDK 一级 part 的事件）。
- HarnessAgent 直接管自己的对话历史，**不重放整个 message 数组**，每轮只取最新 user 消息——这是与 `ToolLoopAgent` 最大的行为差异。

### 2.3 当前依赖状态

- AI SDK v7 beta 已就位：`ai: 7.0.0-beta.182`。
- `@ai-sdk/harness`、`@ai-sdk/harness-pi`、`@ai-sdk/sandbox-just-bash` 已被装进 `node_modules`，但 **未声明在 `package.json`/`pnpm-lock.yaml`**，需正式纳入依赖。
- `@ai-sdk/harness-claude-code`、`@ai-sdk/sandbox-vercel` 未安装（本方案不使用）。

### 2.4 常用入口参照

| 文件 | 职责 |
|------|------|
| `apps/desktop/src/renderer/src/agents/builtin-agents.json` | 内置智能体数据 |
| `apps/desktop/src/renderer/src/stores/builtinAgents.ts` | JSON → Agent 加载、`mergeBuiltinAgents`、`BUILTIN_AGENT_IDS` |
| `apps/desktop/src/renderer/src/stores/agent.ts` | Agent Pinia store (CRUD/持久化/sync) |
| `apps/desktop/src/renderer/src/services/chatService/index.ts:52` | `chatService.createAgent`（运行时入口） |
| `apps/desktop/src/renderer/src/composables/useChat.ts:289` | `_useChat` 消费 UIMessageStream |
| `apps/desktop/src/main/index.ts:608-613` | 主进程 IPC setup 区 |
| `apps/desktop/src/preload/index.ts` | `window.api.*` 暴露 |
| `packages/types/src/agent.ts` | `Agent` 类型定义 |

---

## 三、整体架构

```
_renderer (Vue useChat)_
   │  transport.sendMessages({messages})
   ▼
chatService.createAgent(cid, msgs, opts)
   │
   ├─ if agent.harness?.adapter === 'pi' ──► harness 分支
   │        │
   │        ▼
   │   chatService/harnessStream.ts
   │        │  window.api.harness.stream({chatId, prompt, providerConfig, harnessConfig, resumeFrom})
   │        ▼
   │   IPC ─────────────────────────────────────────► _main (Node)_
   │                                                   new HarnessAgent({ harness: pi, sandbox })
   │                                                   session = agent.createSession({sessionId, resumeFrom?})
   │                                                   result = agent.stream({session, prompt})
   │                                                   for await part of result.stream:
   │                                                     send('harness:part:'+chatId, part)
   │                                                   onEnd: session.detach() → persist resumeState
   │                                                          send('harness:end:'+chatId, {resumeState})
   │                                                   onError: send('harness:error:'+chatId, err) + destroy
   │        ▼
   │   harnessStream.ts 把 IPC part 事件组装成 ReadableStream
   │   → toUIMessageStream({stream}) → return 给 _useChat
   │
   └─ (其他 agent) ──► 原 ToolLoopAgent 路径（不动）
                         ▼
                      ToolLoopAgent.stream → uiStream（如旧）
```

Pi 内置工具在主进程 just-bash sandbox 内执行；UI 侧以 `tool-read/write/edit/bash/grep/glob/ls` 与 `dynamic-tool` part 呈现。

---

## 四、改动清单（按 Layer）

### 4.1 依赖与 catalog

- `pnpm-workspace.yaml` catalog 新增：
  - `'@ai-sdk/harness': 1.0.0-beta.x`
  - `'@ai-sdk/harness-pi': 1.0.0-beta.x`
  - `'@ai-sdk/sandbox-just-bash': 1.0.0-beta.x`
  （beta 版以实际 `node_modules/.pnpm` 内版本或 `pnpm view` 核对为准）
- `apps/desktop/package.json` `dependencies` 引用上述三项（`catalog:`）。
- 运行 `pnpm install` 让它们进入 `pnpm-lock.yaml`。
- `apps/desktop/electron.vite.config.*` 确认主进程打包 **不要** externalize 这些包（或按需排除），避免 native/动态 require 丢失。

### 4.2 Agent 类型扩展（`packages/types/src/agent.ts`）

新增可选字段，标识走 harness 路径并配置 adapter：

```ts
harness?: {
  adapter: 'pi'
  model?: string              // Pi 模型 id，如 'anthropic/claude-sonnet-4.6'
  thinkingLevel?: 'low' | 'medium' | 'high'
  permissionMode?: 'auto' | 'allow-reads' | 'allow-edits'
}
```

非 `harness` 字段的 agent 继续走原 `ToolLoopAgent` 路径，零回归。

### 4.3 新增内置智能体（`apps/desktop/src/renderer/src/agents/builtin-agents.json`）

新增一项：

```jsonc
{
  "id": "builtin-pi-harness",
  "name": "Pi Harness",
  "description": "基于 AI SDK HarnessAgent 的编码智能体（Pi 适配器）",
  "tags": [],
  "systemPrompt": "<你的 Pi 编码 Agent 系统提示词>",
  "mcpServers": [],
  "tools": [],
  "builtinTools": [],
  "harness": {
    "adapter": "pi",
    "model": "anthropic/claude-sonnet-4.6",
    "thinkingLevel": "medium",
    "permissionMode": "allow-edits"
  }
}
```

> `harness` 字段需 `BuiltinAgentJson` 类型与 `Agent` 接口保持一致；`builtinAgents.ts` 的 `createBuiltinAgent` 透传即可。

### 4.4 主进程 harness 服务（`apps/desktop/src/main/services/harness.ts`，新建）

- 模块级按 `model` 缓存 `HarnessAgent` 实例：

```ts
const agent = new HarnessAgent({
  harness: createPi({
    model,
    thinkingLevel,
    auth: { customEnv }   // 由 IPC payload 内 providerConfig 组装
  }),
  sandbox: createJustBashSandbox(),
  instructions,
  permissionMode
})
```

- 凭据来源：IPC payload（renderer 传入的 `provider.apiKey` / `provider.baseUrl` / `providerType`）组装 `auth.customEnv`，不直接读 `process.env`，以复用应用内 provider 设置。
- 会话表：`Map<chatId, { session?, resumeFrom?, abortController? }>`。
- IPC handlers（注册在 `apps/desktop/src/main/index.ts:608-613` 的 setup 区）：

| Handler | 行为 |
|---------|------|
| `harness:stream` | `{chatId, prompt, providerConfig, harnessConfig, resumeFrom?}` → 构造/复用 agent → `createSession` → `agent.stream` → 向 renderer 推 `harness:part:<chatId>` → 完成时 `session.detach()` 存 resumeState 并发 `harness:end:<chatId>` |
| `harness:stop` | `abortController.abort()` + `session.stop()` |
| `harness:destroy` | 应用退出/会话关闭时 `session.destroy()` |

- 序列化 helper：把 AI SDK `TextStreamPart` 做 JSON 安全化（丢函数/AbortSignal），多数 part 是 plain object。

### 4.5 Preload 暴露（`apps/desktop/src/preload/index.ts`）

仿现有 ipc 暴露模式新增 `window.api.harness`：

```ts
harness: {
  stream: (cfg) => ipcRenderer.invoke('harness:stream', cfg),
  stop:   (chatId) => ipcRenderer.invoke('harness:stop', chatId),
  onPart: (chatId, cb) => ipcRenderer.on(`harness:part:${chatId}`, (_e, part) => cb(part)),
  onEnd:  (chatId, cb) => ipcRenderer.on(`harness:end:${chatId}`, (_e, p) => cb(p)),
  onError:(chatId, cb) => ipcRenderer.on(`harness:error:${chatId}`, (_e, err) => cb(err)),
  removeListeners: (chatId) => {
    ipcRenderer.removeAllListeners(`harness:part:${chatId}`)
    ipcRenderer.removeAllListeners(`harness:end:${chatId}`)
    ipcRenderer.removeAllListeners(`harness:error:${chatId}`)
  }
}
```

经 `contextBridge.exposeInMainWorld` 注册。

### 4.6 Renderer harness 分支（`chatService/index.ts`）

在 `createAgent` 入口 (`index.ts:53`) 判断 `agent.harness`：

```ts
if (agent?.harness?.adapter === 'pi') {
  return startHarnessUIStream({ cid, agent, messages, abortSignal, ... })
}
```

新文件 `chatService/harnessStream.ts`：

- 取 `providerConfig`（apiKey/baseURL/providerType）+ `harnessConfig`。
- 调 `window.api.harness.stream(...)`。
- 用 `ReadableStream` 队列把 `onPart` 事件组装成 part 流。
- `toUIMessageStream({ stream })` → 返回（`onEnd` 时持久化 `resumeState` 到 chats store）。
- `abortSignal` 触发 `window.api.harness.stop(chatId)`。
- **消息历史解耦**：`HarnessAgent` 不重放历史，仅发最新 user 消息。在 `useChat.ts:294` 的 `sendMessages` 中对该 agent 做适配（只取 `messages` 末尾的 user content 作为 `prompt`）。
- **resumeState 持久化**：新增 `chat.harnessResumeState`（chats store 可选字段），下次 `harness:stream` 时回传。

### 4.7 UI 渲染

- Pi 工具 part type：`tool-read/write/edit/bash/grep/glob/ls`，以及 `dynamic-tool`（`fileChange`、`compaction`）。
- 现有 Codex 工具渲染组件（`components/codex/`）按 `part.type` 分发；新增分支：
  - `tool-bash` → 复用命令输出 UI
  - `tool-read`/`tool-edit`/`tool-write` → 复用文件差异预览
  - 其余先 JSON 展示（可分阶段美化）。
- AI SDK 的 part shape 标准化，与现有 `ToolUIPart` 渲染逻辑兼容。

### 4.8 移动端

- 现有 `MOBILE_UNSUPPORTED_TOOL_GROUPS` 含「Codex工具」；新 agent `builtinTools` 留空即可。
- 在 `AgentSelector.vue` 按平台隐藏 `builtin-pi-harness`（移动端不展示）。
- `useChat` 的 tool 开关逻辑对 harness agent 直接绕开 MCP/builtin 工具注入。

---

## 五、风险点

1. **just-bash sandbox 在 Electron 打包环境的可行性**是最大不确定性。文档示例假设普通 Node 进程；Electron 主进程打包后 `extraResources`/`asar`/子进程 cwd 可能影响 just-bash 的 shell spawn。→ 阶段一先 PoC 验证。
2. **Pi LLM 后端**：复用应用内 provider key（在线 LLM API），非真正离线。若后续要真离线，可接 `ai-sdk-ollama`（已在依赖里）作 Pi 的 customEnv 后端。
3. **消息历史/UI 行为差异**：Harness 不重放历史，对习惯带上下文的用户有体验差异——只对新 agent 生效，预期需明确。
4. **移动端**：Capacitor 无 Electron 主进程，确认桌面专属。

---

## 六、阶段一：PoC 验证（不接 UI）

**目标**：验证 `just-bash` sandbox 在 Electron 主进程（dev 与打包）的可行性，跑通 `HarnessAgent.stream()` 的 part 流。

### 6.1 步骤

1. **正式声明依赖**
   - `pnpm-workspace.yaml` catalog 新增三项（`pnpm view @ai-sdk/harness version` 核对 beta 版本号）。
   - `apps/desktop/package.json` `dependencies` 加三项 `catalog:`。
   - `pnpm install` 让其进入 `pnpm-lock.yaml`。
   - `pnpm --filter desktop typecheck` 通过。

2. **新建 PoC 模块** `apps/desktop/src/main/services/harness.ts`：
   ```ts
   import { HarnessAgent } from '@ai-sdk/harness/agent'
   import { createPi } from '@ai-sdk/harness-pi'
   import { createJustBashSandbox } from '@ai-sdk/sandbox-just-bash'

   export async function runPiHarnessPoC({
     apiKey, baseURL, providerType, model, prompt, cwd?
   }) {
     const customEnv = providerType === 'anthropic'
       ? { ANTHROPIC_API_KEY: apiKey, ...(baseURL ? { ANTHROPIC_BASE_URL: baseURL } : {}) }
       : { OPENAI_API_KEY: apiKey, ...(baseURL ? { OPENAI_BASE_URL: baseURL } : {}) }

     const agent = new HarnessAgent({
       harness: createPi({ model, auth: { customEnv } }),
       sandbox: createJustBashSandbox(/* cwd? */)
     })

     const session = await agent.createSession()
     try {
       const result = await agent.stream({ session, prompt })
       for await (const part of result.stream) {
         console.log('[harness part]', part.type, part)
       }
     } finally {
       await session.destroy()
     }
   }
   ```

3. **临时 IPC 触发器**：在 `apps/desktop/src/main/index.ts:608` setup 区注册 `ipcMain.handle('harness:poctest', (_e, cfg) => runPiHarnessPoC(cfg))`。
   预load 暴露 `window.api.harnessPocTest`。

4. **触发入口**：开发期在 renderer 控制台调用 `window.api.harnessPocTest({...})` 或设置页加临时按钮。

5. **运行 `pnpm dev`**，手动触发 PoC，观察主进程终端 part 流是否正常、`bash` 工具是否在 sandbox 内成功执行。

### 6.2 PoC 验收标准

- [ ] `pnpm install` 后 `pnpm-lock.yaml` 含三项。
- [ ] 主进程能 import 三个包且 `createJustBashSandbox()` 不抛错。
- [ ] `agent.createSession()` 返回 session。
- [ ] `agent.stream({session, prompt})` 产出 text/tool part 并在 console 可见。
- [ ] `bash` 工具在 sandbox 内执行成功（如 `ls` / `echo`）。
- [ ] 一次 turn 结束后 `session.destroy()` 不抛错。

### 6.3 PoC 失败处理

- 切到 **Plan B：自定义 `HarnessV1SandboxProvider`** 复用现有 `pty:spawn`/`hashline:read`/`edit-file:execute` IPC 作为 fs/shell 后端。工作量更大但与现有架构最契合，仍保持「纯本地」。
- Plan B 需另起一份子设计文档。

### 6.4 PoC 通过后

进入阶段二（类型/UI/IPC/渲染），按阶段二第 7 节执行顺序推进。

---

## 七、阶段二：完整集成（PoC 通过后）

### 7.1 落地步骤（按执行顺序）

1. **类型扩展**：`Agent.harness`（`packages/types/src/agent.ts`）+ `BuiltinAgentJson` 配套字段。
2. **内置 JSON 新增** `builtin-pi-harness`；`typecheck` 通过、`getBuiltinAgents()` 字段完整、`BUILTIN_AGENT_IDS` 含新 ID。
3. **主进程 `harness.ts` 完整化**：`HarnessAgent` 缓存、会话表、`harness:stream`/`harness:stop`/`harness:destroy` IPC、AbortController。
4. **Preload** `window.api.harness` 完整暴露。
5. **`chatService` harness 分支**：`index.ts:53` 分流 + `chatService/harnessStream.ts` + `useChat.ts:294` 消息历史解耦 + `chat.harnessResumeState` 持久化。
6. **UI part 渲染** 补齐 `tool-bash`/`tool-read`/`tool-write`/`tool-edit`/`dynamic-tool`（可先 JSON 渲染再美化）。
7. **会话生命周期**：`resumeState` 持久化、停止、`destroy`；app quit 全量 `session.destroy()`。
8. **AgentSelector 平台隐藏** + 移动端 `useChat` 工具逻辑绕开。

### 7.2 验证清单（参考技能清单 10 条）

- [ ] JSON 文件语法有效（`node -e "JSON.parse(fs.readFileSync('...'))"`）。
- [ ] JSON 必填字段完整（`id`, `name`, `systemPrompt`, `builtinTools`, `mcpServers`, `tools`, `harness` 等）。
- [ ] `getBuiltinAgents()` 返回新智能体且 `harness` 字段透传。
- [ ] `BUILTIN_AGENT_IDS` 自动包含 `builtin-pi-harness`。
- [ ] 持久化恢复后 `ensureBuiltinAgents()` 能正确合并。
- [ ] 新智能体在 `AgentSelector.vue` 桌面端可见、带「内置」标签；移动端隐藏。
- [ ] 设置页 `agents.vue` 中不可删除。
- [ ] 克隆后剥离「内置」标签。
- [ ] `agentCreator` 工具可正确创建含 `harness` 字段的智能体（如开放该路径）。
- [ ] 多智能体系统提示词对该 agent 行为正确（harness agent 不应被 `delegate_to_sub_agent` 调用——考虑在 `allowedSubAgents` 过滤层处理）。
- [ ] `pnpm --filter desktop typecheck` 通过。
- [ ] `pnpm typecheck` 通过。
- [ ] `pnpm lint` 通过。

### 7.3 端到端验收

- [ ] 桌面端选中 `Pi Harness` 智能体，发送一条编码任务，能看到 text 增量、`bash`/`read`/`edit` 工具调用 part 渲染。
- [ ] 停止按钮生效（`abortSignal` → `harness:stop`）。
- [ ] 关闭会话再打开能 resume（`resumeState` 持久化往返）。
- [ ] 应用退出后无残留 sandbox/shell 子进程。
- [ ] 现有 `ToolLoopAgent` 路径所有智能体行为无变化（回归）。

---

## 八、文件改动清单

### 新增

| 文件 | 用途 |
|------|------|
| `apps/desktop/src/main/services/harness.ts` | 主进程 HarnessAgent 服务、会话表、PoC 入口 |
| `apps/desktop/src/renderer/src/services/chatService/harnessStream.ts` | renderer harness 分支：IPC part → UIMessageStream |

### 修改

| 文件 | 改动 |
|------|------|
| `pnpm-workspace.yaml` | catalog 新增三项 |
| `apps/desktop/package.json` | dependencies 新增三项 |
| `packages/types/src/agent.ts` | `Agent.harness` 字段（+ `BuiltinAgentJson` 配套） |
| `apps/desktop/src/renderer/src/agents/builtin-agents.json` | 新增 `builtin-pi-harness` 条目 |
| `apps/desktop/src/main/index.ts` | 注册 `harness:*` IPC handlers |
| `apps/desktop/src/preload/index.ts` | `window.api.harness` 暴露 |
| `apps/desktop/src/renderer/src/services/chatService/index.ts` | `createAgent` 入口 harness 分流 |
| `apps/desktop/src/renderer/src/composables/useChat.ts` | `sendMessages` 对 harness agent 仅发最新 user 消息 |
| `apps/desktop/src/renderer/src/pages/chat/AgentSelector.vue` | 移动端隐藏 `builtin-pi-harness` |
| `apps/desktop/src/renderer/src/stores/chats.ts` | `chat.harnessResumeState` 字段持久化 |
| 渲染组件（`components/codex/` 等） | 新增 `tool-bash`/`tool-read`/`tool-write`/`tool-edit`/`dynamic-tool` part 渲染分支 |
| `apps/desktop/electron.vite.config.*` | 确认主进程 externalize 配置不丢包 |

---

## 九、备选方案（Plan B）

当阶段一 PoC 验证 `just-bash` 在 Electron 主进程跑不通时启用：

- **自定义 `HarnessV1SandboxProvider` 实现**，底层复用现有 IPC：
  - shell 执行 → `pty:spawn`
  - 读文件 → `hashline:read`
  - 写/编辑 → `edit-file:execute` / `search-replace:execute`
- 工作量更大，但与现有架构最契合，仍保持「纯本地」。
- 需另起子设计文档（阶段一失败后补）。

---

## 十、参考文档

- [HarnessAgent](https://ai-sdk.dev/v7/docs/ai-sdk-harnesses/harness-agent)
- [Harnesses Overview](https://ai-sdk.dev/v7/docs/ai-sdk-harnesses/overview)
- [Pi Harness](https://ai-sdk.dev/v7/providers/ai-sdk-harnesses/pi)
- [Harness Adapters](https://ai-sdk.dev/v7/docs/ai-sdk-harnesses/harness-adapters)
- [Harnesses with AI SDK UI](https://ai-sdk.dev/v7/docs/ai-sdk-harnesses/ui)
- [Harness Tools](https://ai-sdk.dev/v7/docs/ai-sdk-harnesses/tools)
- [Harness Skills](https://ai-sdk.dev/v7/docs/ai-sdk-harnesses/skills)