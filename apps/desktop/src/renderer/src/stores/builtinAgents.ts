import codexProgrammingPrompt from '@renderer/prompts/agentqi-codex-programming-prompt.md?raw'
import skillCreatorPrompt from '@renderer/prompts/agentqi-skill-creator-prompt.md?raw'

export const BUILTIN_AGENT_TAG = '内置'

const defaultAgentBase = (): Agent => ({
  id: 'default',
  name: '默认助手',
  description: '通用AI助手',
  tags: ['默认', BUILTIN_AGENT_TAG],
  systemPrompt: '你是一个有帮助的AI助手。',
  mcpServers: [],
  tools: [],
  builtinTools: [],
  builtinToolsRequireApproval: [],
  builtinToolConfigs: {},
  execCommandRunInBackground: false,
  createdAt: Date.now(),
  updatedAt: Date.now(),
  knowledgeBaseIds: [],
  temperature: 0.7,
  topP: 1,
  topK: 40,
  presencePenalty: 0,
  frequencyPenalty: 0,
  maxOutputTokens: 0,
  contextCount: 0,
  contextTokenCount: 0,
  maxToolCalls: 0,
  speechSpeed: 1,
  speechLanguage: 'auto',
  speechModel: undefined
})

const createBuiltinAgent = (
  agent: Omit<Agent, 'createdAt' | 'updatedAt'> & { createdAt?: number; updatedAt?: number }
): Agent => {
  const now = Date.now()
  return {
    ...agent,
    tags: [...new Set([BUILTIN_AGENT_TAG, ...(agent.tags || [])])],
    createdAt: agent.createdAt || now,
    updatedAt: agent.updatedAt || now
  }
}

export const getBuiltinAgents = (): Agent[] => [
  defaultAgentBase(),
  createBuiltinAgent({
    id: 'builtin-skill-search',
    name: '技能搜索',
    description: '发现、加载和推荐适合当前任务的技能。',
    tags: [],
    systemPrompt:
      '你是技能搜索智能体。你的职责是理解用户想扩展的能力，优先使用 loadSkill 加载相关技能说明，必要时引导用户搜索、安装或创建技能。输出要聚焦可执行建议，说明推荐技能的用途、适用场景和下一步。',
    mcpServers: [],
    tools: [],
    builtinTools: ['loadSkill', 'exec_command', 'fetch'],
    builtinSkills: ['find-skills'],
    builtinToolsRequireApproval: [],
    builtinToolConfigs: {},
    execCommandRunInBackground: false,
    knowledgeBaseIds: [],
    temperature: 0.5,
    topP: 1,
    topK: 40,
    presencePenalty: 0,
    frequencyPenalty: 0,
    maxOutputTokens: 0,
    contextCount: 0,
    contextTokenCount: 0,
    maxToolCalls: 0,
    speechSpeed: 1,
    speechLanguage: 'auto',
    speechModel: undefined
  }),
  createBuiltinAgent({
    id: 'builtin-skill-creator',
    name: '技能创建',
    description: '创建、更新和整理技能目录中的技能。',
    tags: [],
    systemPrompt: skillCreatorPrompt,
    mcpServers: [],
    tools: [],
    builtinTools: [
      'loadSkill',
      'change_working_directory',
      'list_dir',
      'search_project',
      'readFile',
      'edit_file',
      'exec_command',
      'fetch'
    ],
    builtinSkills: ['skill-creator'],
    builtinToolsRequireApproval: ['exec_command'],
    builtinToolConfigs: {},
    execCommandRunInBackground: false,
    knowledgeBaseIds: [],
    temperature: 0.4,
    topP: 1,
    topK: 40,
    presencePenalty: 0,
    frequencyPenalty: 0,
    maxOutputTokens: 0,
    contextCount: 0,
    contextTokenCount: 0,
    maxToolCalls: 0,
    speechSpeed: 1,
    speechLanguage: 'auto',
    speechModel: undefined
  }),
  createBuiltinAgent({
    id: 'builtin-canvas',
    name: 'Canvas',
    description: '在 Canvas 工作区创建、读取、搜索、编辑和运行文件。',
    tags: [],
    systemPrompt:
      '你是 Canvas 智能体。你负责在 Canvas 工作区完成原型、页面、脚本和文档类任务。先查看当前 Canvas 文件结构，编辑前读取目标文件并使用 hashline，运行命令后同步结果。回复要说明改动和可验证入口。',
    mcpServers: [],
    tools: [],
    builtinTools: [
      'list_canvas_directory',
      'read_canvas_file',
      'search_canvas_content',
      'edit_file_canvas',
      'exec_command_canvas'
    ],
    builtinToolsRequireApproval: ['exec_command_canvas'],
    builtinToolConfigs: {},
    execCommandRunInBackground: false,
    knowledgeBaseIds: [],
    temperature: 0.4,
    topP: 1,
    topK: 40,
    presencePenalty: 0,
    frequencyPenalty: 0,
    maxOutputTokens: 0,
    contextCount: 0,
    contextTokenCount: 0,
    maxToolCalls: 0,
    speechSpeed: 1,
    speechLanguage: 'auto',
    speechModel: undefined
  }),
  createBuiltinAgent({
    id: 'builtin-agent-creator',
    name: '智能体创建',
    description: '根据目标创建和配置新智能体。',
    tags: [],
    systemPrompt:
      '你是智能体创建助手。先澄清用户希望智能体承担的任务、所需工具、知识库、技能和模型偏好；信息足够后调用 agentCreator 创建智能体。创建前优先选择最小且必要的工具集合，并提醒用户高风险工具是否需要批准。',
    mcpServers: [],
    tools: [],
    builtinTools: ['agentCreator', 'loadSkill'],
    builtinToolsRequireApproval: [],
    builtinToolConfigs: {},
    execCommandRunInBackground: false,
    knowledgeBaseIds: [],
    temperature: 0.4,
    topP: 1,
    topK: 40,
    presencePenalty: 0,
    frequencyPenalty: 0,
    maxOutputTokens: 0,
    contextCount: 0,
    contextTokenCount: 0,
    maxToolCalls: 0,
    speechSpeed: 1,
    speechLanguage: 'auto',
    speechModel: undefined
  }),
  createBuiltinAgent({
    id: 'builtin-codex',
    name: 'Codex',
    description: '面向项目代码的搜索、读取、编辑、测试和命令执行。',
    tags: [],
    systemPrompt: codexProgrammingPrompt,
    mcpServers: [],
    tools: [],
    builtinTools: [
      'multi_tool_use_parallel',
      'change_working_directory',
      'search_project',
      'list_dir',
      'readFile',
      'edit_file',
      'exec_command',
      'loadSkill',
      'delegate_to_sub_agent'
    ],
    builtinToolsRequireApproval: ['exec_command'],
    builtinToolConfigs: {},
    execCommandRunInBackground: false,
    knowledgeBaseIds: [],
    temperature: 0.3,
    topP: 1,
    topK: 40,
    presencePenalty: 0,
    frequencyPenalty: 0,
    maxOutputTokens: 0,
    contextCount: 0,
    contextTokenCount: 0,
    maxToolCalls: 0,
    speechSpeed: 1,
    speechLanguage: 'auto',
    speechModel: undefined
  }),
  createBuiltinAgent({
    id: 'builtin-notes',
    name: '笔记',
    description: '管理、检索、创建和编辑应用内笔记。',
    tags: [],
    systemPrompt:
      '你是笔记智能体。你负责帮助用户整理知识、查找笔记、创建记录和编辑已有内容。读取或定位笔记用 list_notes，新增、删除、移动用 manage_note，修改正文前先读取笔记并用 edit_note 的 hashline 格式编辑。回复要保留笔记路径或 note_id 方便用户继续追踪。',
    mcpServers: [],
    tools: [],
    builtinTools: ['list_notes', 'manage_note', 'edit_note'],
    builtinToolsRequireApproval: ['manage_note', 'edit_note'],
    builtinToolConfigs: {},
    execCommandRunInBackground: false,
    knowledgeBaseIds: [],
    temperature: 0.5,
    topP: 1,
    topK: 40,
    presencePenalty: 0,
    frequencyPenalty: 0,
    maxOutputTokens: 0,
    contextCount: 0,
    contextTokenCount: 0,
    maxToolCalls: 0,
    speechSpeed: 1,
    speechLanguage: 'auto',
    speechModel: undefined
  })
]

export const BUILTIN_AGENT_IDS = new Set(getBuiltinAgents().map((agent) => agent.id))

const getBuiltinAgentTags = (id: string): string[] => {
  return getBuiltinAgents().find((agent) => agent.id === id)?.tags || [BUILTIN_AGENT_TAG]
}

export const ensureBuiltinTags = (agent: Agent): Agent => {
  if (!BUILTIN_AGENT_IDS.has(agent.id)) return agent
  const tags = getBuiltinAgentTags(agent.id)
  return JSON.stringify(tags) === JSON.stringify(agent.tags || []) ? agent : { ...agent, tags }
}

export const mergeBuiltinAgents = (currentAgents: Agent[]): Agent[] => {
  const builtinAgents = getBuiltinAgents()
  const builtinById = new Map(builtinAgents.map((agent) => [agent.id, agent]))
  const seen = new Set<string>()
  const merged = currentAgents.map((agent) => {
    seen.add(agent.id)
    const builtinAgent = builtinById.get(agent.id)
    if (!builtinAgent) return agent

    return {
      ...builtinAgent,
      ...agent,
      tags: builtinAgent.tags,
      builtinSkills: builtinAgent.builtinSkills,
      builtinToolConfigs: {
        ...(builtinAgent.builtinToolConfigs || {}),
        ...(agent.builtinToolConfigs || {})
      }
    }
  })

  const missingBuiltinAgents = builtinAgents.filter((agent) => !seen.has(agent.id))
  return [...merged, ...missingBuiltinAgents]
}
