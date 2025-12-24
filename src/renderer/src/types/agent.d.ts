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
    createdAt: number
    updatedAt: number
    knowledgeBaseIds?: string[] // 关联的知识库ID列表
    ragEnabled?: boolean // 是否启用RAG，将检索上下文插入到用户输入中
    terminalStartupPath?: string // 终端启动位置
  }

  // 智能体状态接口
  interface AgentState {
    agents: Agent[]
    selectedAgentId: string | null
  }
}

export {}
