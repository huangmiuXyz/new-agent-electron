---
name: agent-qi-app-dev-zh
description: 面向 Agent-Qi / agent-qi-electron 应用本体开发的中文技能。涉及内置技能的创建、修改、加载流程、SKILL.md 格式、技能发现机制、Agent-技能绑定、loadSkill 工具、@skill 提及系统、技能配置 UI 时，必须使用此技能。
---

# 内置技能链路

技能（Skill）是以目录 + SKILL.md 文件形式存在的专业知识包，供 AI 智能体按需加载以获取领域特定的指导。整体链路分三层：定义层 → 发现与加载层 → 运行时注入层。

```
定义层
  │
  ├─► 内置技能: apps/desktop/resources/builtin-skills/<name>/SKILL.md
  ├─► 3 个内置: codegraph / find-skills / skill-creator
  └─► 用户技能: ~/.agents/skills/<name>/SKILL.md
       │
       ▼
发现与加载层 (skillsService.ts)
  │
  ├─► discoverSkills() ── 扫描目录 → 解析 frontmatter → 过滤启/禁用
  │     ├─ 用户技能目录: getSkillsDirectories() ← Agent.skillDirectory
  │     └─ 内置技能目录: getBuiltinSkillsDirectories() ← resources/builtin-skills/
  │
  ├─► loadSkill(name) ── 按名称查找 → 读取 SKILL.md → strip frontmatter → 返回正文
  ├─► buildSkillsPrompt() ── 构建 <available_skills> XML 系统提示词
  └─► createLoadSkillTool() ── 创建 loadSkill 内置工具定义 (Zod schema + execute)
       │
       ▼
运行时注入层
  │
  ├─► chatService/index.ts ── discoverSkills() → buildSkillsPrompt() → 注入 system prompt
  ├─► grouped-tools.ts ── getAgentBuiltinTools(skills) → 注册 loadSkill 工具
  ├─► createSkillReferenceMiddleware ── 拦截 @skill:name 用户提及 → loadSkill → 注入 XML
  └─► agent-tools.ts ── getAgentBuiltinTools() 接收 skills 参数 → 注入 loadSkill / agentCreator
```

## 1. SKILL.md 文件格式

每个技能是一个包含 `SKILL.md` 的目录，目录名即 skill 名：

```
<skill-name>/
  SKILL.md             # 必需: YAML frontmatter + Markdown 正文
  scripts/             # 可选: 可执行代码
  references/          # 可选: 按需加载的文档
  assets/              # 可选: 模板、图标、字体
  evals/evals.json     # 可选: 基准测试用例
```

### Frontmatter 细则

```markdown
---
name: my-skill                # 必需: 小写字母+数字+短横线, 1-64 字符
description: 一段描述这个技能用途的文字  # 必需: 纯文本, 最多 1024 字符
enabled: true                 # 可选: true/false, 默认为 true
metadata:                     # 可选: 一级嵌套的元数据映射
  key1: value1
  key2: value2
---

# My Skill

正文 Markdown 内容...
```

**frontmatter 约束**：
- `name` 必须匹配正则 `^[a-z0-9-]+$`，不能以 `-` 开头/结尾，不能包含 `--`
- `description` 最多 1024 字符
- 只支持一级嵌套（如上面的 `metadata:` 块），不支持多级嵌套

### 三级加载体系

| 级别 | 内容 | 何时在上下文中 |
|------|------|---------------|
| 元数据 | `name` + `description` | 始终在系统提示词的 `<available_skills>` 中 |
| 正文 | SKILL.md body（frontmatter 剥离后） | 通过 `loadSkill` 工具按需加载、或通过 `@skill` 提及 |
| 附属资源 | scripts/ references/ assets/ | 按需由 AI 打开/读取 |

---

## 2. 内置技能

所有内置技能位于：`apps/desktop/resources/builtin-skills/`

| 技能名 | 目录 | 描述 |
|--------|------|------|
| `codegraph` | `apps/desktop/resources/builtin-skills/codegraph/` | 使用 CodeGraph CLI 进行代码知识图谱查询 |
| `find-skills` | `apps/desktop/resources/builtin-skills/find-skills/` | 发现和安装 agent 生态中的技能 |
| `skill-creator` | `apps/desktop/resources/builtin-skills/skill-creator/` | 创建、修改和验证技能（485 行） |

### 内置技能发现路径

`getBuiltinSkillsDirectories()` 按优先级尝试以下路径：

```ts
function getBuiltinSkillsDirectories(): string[] {
  const candidates = new Set<string>()
  const addCandidate = (basePath) => {
    candidates.add(path.join(basePath, 'resources/builtin-skills'))
  }
  // 1. app.getAppPath()
  // 2. .asar.unpacked 变体（打包后）
  // 3. path.resolve('.') 开发模式 fallback
  return candidates.filter((dir) => fs.existsSync(dir))
}
```

### 新增内置技能

在 `apps/desktop/resources/builtin-skills/` 下创建目录 + SKILL.md 即可，无需修改代码。重启应用后技能会自动被 `discoverSkills()` 发现。

**约定**：
- 目录名、frontmatter 的 `name` 保持一致
- `name` 使用英文短横线命名法，如 `code-review`
- `description` 简洁说明技能适用场景，帮助智能体判断何时加载该技能
- 正文保持合理长度（建议 <500 行），过长时考虑拆分为 `references/` 中的附属文档

---

## 3. 技能发现机制

### discoverSkills()

`apps/desktop/src/renderer/src/services/skillsService.ts:240`

```ts
export function discoverSkills(
  directories?: string[],
  options: DiscoverSkillsOptions = {}
): SkillMetadata[]
```

**扫描来源**（按顺序，同名先到的胜出）：
1. 用户技能目录 — `getSkillsDirectories(chatId)` → 来自 `Agent.skillDirectory`（默认 `~/.agents/skills`）
2. 内置技能目录 — `getBuiltinSkillsDirectories()` → `resources/builtin-skills/`

**扫描过程**：
1. 对每个技能目录调用 `fs.readdirSync()`
2. 过滤出有 `SKILL.md` 的子目录
3. 解析 frontmatter：`parseFrontmatter()`（自定义 YAML 解析器，无外部依赖）
4. 校验有效性：`validateFrontmatter()`（name 格式、description 长度）
5. 跳过重复项（case-insensitive name 去重）
6. 应用 Agent 启/禁用过滤
7. 标记来源：`builtin: true`（来自内置目录）或 `false`

### 启/禁用三模式

```ts
const enabled =
  builtinSkillNames.size > 0
    ? enabledSkillNames.has(normalizedName) ||
      (builtinSkillNames.has(normalizedName) && !disabledSkillNames.has(normalizedName))
    : !disabledSkillNames.has(normalizedName)
```

| 模式 | builtinSkills | 行为 |
|------|---------------|------|
| **全开模式** | 空/未定义 | 所有发现的技能默认启用；用户可通过 `disabledSkills` 禁用特定技能 |
| **白名单模式** | 非空数组 | 仅 `builtinSkills` + `enabledSkills` 中的技能启用；`disabledSkills` 可从白名单中排除 |

---

## 4. 技能加载与注入

### loadSkill()

```ts
export function loadSkill(
  skillName: string,
  skills: SkillMetadata[] = discoverSkills()
): LoadedSkill | null
// 返回: { skillDirectory: string, content: string }
```

- 按名称（case-insensitive）查找技能
- 读取 `SKILL.md` 文件内容
- `stripFrontmatter()` 剥离 YAML 头，只返回 Markdown 正文
- 无内存缓存，每次调用都从磁盘读取

### 系统提示词注入

`chatService/index.ts` 在创建聊天时执行：

```ts
const skills = discoverSkills(undefined, { chatId: cid })
const hasLoadSkillTool = skillsEnabled && !!selectedBuiltinTools?.includes('loadSkill')
const skillsPrompt = hasLoadSkillTool ? buildSkillsPrompt(skills, cid) : ''
```

`buildSkillsPrompt()` 输出（当有技能时）：

```markdown
## Skills
Use the `loadSkill` tool when a user request would benefit from specialized instructions.
After loading a skill, open referenced files under the returned skill directory when needed.
Current agent skill directory: ~/.agents/skills

<available_skills>
  <skill>
    <name>codegraph</name>
    <description>使用 CodeGraph CLI 进行代码知识图谱查询</description>
    <location>/path/to/codegraph/SKILL.md</location>
  </skill>
</available_skills>
```

### loadSkill 内置工具

注册在 `agent-tools.ts` 的 `getAgentBuiltinTools(skills)` 中：

```ts
export function createLoadSkillTool(skills: SkillMetadata[]) {
  return {
    title: '加载技能',
    description: '加载技能以获取专业指导和指令。',
    inputSchema: z.object({
      name: z.string().describe('要加载的技能名称')
    }),
    execute: async (args) => {
      const { name } = args
      const result = loadSkill(name, skills)
      // 返回 skillDirectory + content 或错误消息
    }
  }
}
```

工具归入「Agent工具」工具组，仅当智能体 `builtinTools` 包含 `loadSkill` 时注册到聊天。

---

## 5. `@skill` 提及系统

文件：`apps/desktop/src/renderer/src/services/chatService/middleware/skillReferences.ts`

用户在聊天输入 `@skill:name`、`@技能:name` 或直接 `@name` 时触发：

```ts
const SKILL_REFERENCE_REGEX =
  /(^|[\s([{'"“‘])@(?:(?:skills|技能):)?([a-z0-9-]{1,64})(?=$|[\s)\]};,.!?'"，。！？、】【])/gi
```

匹配后：
1. `extractReferencedSkillNames()` 提取所有 `@` 引用的技能名
2. 对每个引用调用 `loadSkill(name, skills)`
3. 构建 `<referenced_skills>` XML 块注入到用户消息前

```xml
以下是用户通过 @ 引用的技能，请优先参考这些技能说明完成请求：

<referenced_skills>
<skill name="codegraph">
<description>使用 CodeGraph CLI 进行代码知识图谱查询</description>
[技能正文内容...]
</skill>
</referenced_skills>

<user_message>
原始用户消息
</user_message>
```

该中间件在 `chatService/index.ts` 中通过 `createSkillReferenceMiddleware({ skills, workPath })` 创建并注入到 AI SDK 的 middleware 链中。

---

## 6. Agent-技能绑定

智能体通过以下字段控制技能行为（`packages/types/src/agent.ts`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| `skillDirectory` | `string?` | 自定义技能目录路径，默认 `~/.agents/skills` |
| `builtinSkills` | `string[]?` | 白名单模式：默认启用的技能名 |
| `enabledSkills` | `string[]?` | 用户额外启用的非默认技能名 |
| `disabledSkills` | `string[]?` | 用户禁用的技能名 |

对应的 UI 配置在 `useAgent.tsx` 的「技能配置」Tab 中：
- `skillDirectory` — 路径选择器
- 技能列表 — `discoverSkills()` 展示所有可用技能，勾选/取消控制启禁用
- 右键菜单 — 查看详情、编辑技能、打开文件夹、删除（内置技能不可编辑/删除）
- 「新建技能」按钮 — 行内创建新技能

---

## 7. 技能设置页

`apps/desktop/src/renderer/src/pages/settings/skills.vue`

- 完整的技能管理界面
- CRUD 操作、目录管理
- 内置技能 vs 用户技能区分显示
- 支持创建、编辑、重命名、删除、启禁用

---

## 8. 验证清单

新增或修改内置技能后检查：

- `discoverSkills()` 能正确发现新技能，`builtin` 标记为 `true`
- 新技能在 `buildSkillsPrompt()` 的 `<available_skills>` 中出现
- 新技能的 Agent 在 `builtinSkills` 中引用了正确的技能名（case-insensitive）
- `loadSkill('<skill-name>')` 能正确加载并返回正文
- `@技能:name` 或 `@name` 提及能正确触发注入
- 设置页技能列表中能看到新技能，标记为 `内置` 且不可编辑/删除
- 技能目录名与 `name` frontmatter 一致，避免混淆
- `pnpm --filter desktop typecheck` 通过

## 常见源码入口

| 文件 | 职责 |
|------|------|
| `apps/desktop/resources/builtin-skills/<name>/SKILL.md` | 内置技能定义 |
| `apps/desktop/src/renderer/src/services/skillsService.ts` | 技能发现、加载、frontmatter 解析、提示词构建、`createLoadSkillTool` |
| `apps/desktop/src/renderer/src/services/chatService/index.ts` | 聊天初始化时注入技能 |
| `apps/desktop/src/renderer/src/services/chatService/middleware/skillReferences.ts` | `@skill` 提及中间件 |
| `apps/desktop/src/renderer/src/services/builtin-tools/tools/agent-tools.ts` | `getAgentBuiltinTools(skills)` 注册 loadSkill |
| `apps/desktop/src/renderer/src/services/builtin-tools/grouped-tools.ts` | 工具分组注册 |
| `apps/desktop/src/renderer/src/composables/useAgent.tsx` | 技能配置 UI（创建/编辑模态框） |
| `apps/desktop/src/renderer/src/pages/settings/skills.vue` | 技能设置管理页 |
| `apps/desktop/src/renderer/src/stores/builtinAgents.ts` | 加载 `builtinSkills` 字段 |
| `packages/types/src/agent.ts` | Agent.skillDirectory / builtinSkills / enabledSkills / disabledSkills |
