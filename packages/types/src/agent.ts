declare global {
  // 智能体接口
  interface Agent {
    id: string
    name: string
    description?: string
    systemPrompt: string
    mcpServers: string[] // MCP服务器名称列表
    tools: string[] // 工具名称列表，格式为 "服务器名.工具名"
    builtinTools: string[] // 内置工具名称列表
    icon?: string
    avatar?: string
    createdAt: number
    updatedAt: number
    knowledgeBaseIds?: string[] // 关联的知识库ID列表
    ragEnabled?: boolean // 是否启用RAG，将检索上下文插入到用户输入中
    terminalStartupPath?: string // 终端启动位置
    skillDirectory?: string // 技能目录
    backgrounds?: AgentBackground[] // 背景图片或视频列表
    temperature?: number // 温度
    topP?: number // top-p
    topK?: number // top-k
    presencePenalty?: number // 话题新鲜度 (presence penalty)
    frequencyPenalty?: number // 频率惩罚 (frequency penalty)
    maxOutputTokens?: number // 最大输出 token 数
    contextCount?: number // 上下文条数
    autoCompressContext?: boolean // 自动压缩上下文
    compressModel?: { providerId: string; modelId: string } // 用于压缩的模型
    speechVoice?: string // 语音名称
    speechMode?: 'sentence' | 'paragraph' | 'full' // 语音生成模式
    speechSpeed?: number // 语音速度
    speechLanguage?: string // 语音语言
    speechProviderOptions?: Record<string, unknown> // 语音选项
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
