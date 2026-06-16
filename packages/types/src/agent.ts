declare global {
  // 智能体接口
  interface Agent {
    id: string
    name: string
    description?: string
    tags?: string[]
    systemPrompt: string
    mcpServers: string[] // MCP服务器名称列表
    tools: string[] // 工具名称列表，格式为 "服务器名.工具名"
    builtinTools: string[] // 内置工具名称列表
    builtinToolsRequireApproval?: string[] // 需要手动批准的内置工具名称列表
    builtinToolConfigs?: {
      computer_use?: {
        screenshotMaxSidePx?: number
      }
      edit_file?: {
        mode?: 'hashline' | 'patch'
      }
      [toolName: string]: Record<string, unknown> | undefined
    } // 内置工具配置
    execCommandRunInBackground?: boolean // exec_command 是否默认在后台静默执行
    allowedSubAgents?: string[] // 允许调用的子智能体名称列表，为空时表示允许调用所有智能体
    icon?: string
    avatar?: string
    createdAt: number
    updatedAt: number
    knowledgeBaseIds?: string[] // 关联的知识库ID列表
    ragEnabled?: boolean // 是否启用RAG，将检索上下文插入到用户输入中
    workPath?: string // 工作路径
    skillDirectory?: string // 技能目录
    disabledSkills?: string[] // 当前智能体禁用的技能名称列表
    backgrounds?: AgentBackground[] // 背景图片或视频列表
    temperature?: number // 温度
    topP?: number // top-p
    topK?: number // top-k
    presencePenalty?: number // 话题新鲜度 (presence penalty)
    frequencyPenalty?: number // 频率惩罚 (frequency penalty)
    maxOutputTokens?: number // 最大输出 token 数，0 表示不限制
    contextCount?: number // 上下文条数，0 表示不限制
    contextTokenCount?: number // 上下文 token 阈值，0 表示不限制
    autoCompressContext?: boolean // 自动压缩上下文
    compressModel?: { providerId: string; modelId: string } // 用于压缩的模型
    maxToolCalls?: number // 一次对话中最大调用工具次数，0 表示不限制
    retryAutoEnabled?: boolean // 对话失败时是否自动重试，直到用户手动停止
    retryIntervalMs?: number // 自动重试间隔（毫秒），0 表示不等待
    speechVoice?: string // 语音名称
    speechMode?: 'sentence' | 'paragraph' | 'full' // 语音生成模式
    speechSpeed?: number // 语音速度
    speechLanguage?: string // 语音语言
    speechProviderOptions?: Record<string, unknown> // 语音选项
    speechModel?: { providerId: string; modelId: string } // 语音模型配置
    defaultModel?: { providerId: string; modelId: string } // 默认模型配置
  }

  // 智能体背景接口
  interface AgentBackground {
    type: 'image' | 'video'
    url: string
  }

  // 智能体状态接口
  interface AgentState {
    agents: Agent[]
    selectedAgentId: string | null
  }
}

export {}
