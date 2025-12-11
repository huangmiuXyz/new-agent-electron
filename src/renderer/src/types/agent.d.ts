declare global {
  // 智能体接口
  interface Agent {
    id: string
    name: string
    description?: string
    systemPrompt: string
    mcpServers: string[] // MCP服务器名称列表
    tools: string[] // 工具名称列表，格式为 "服务器名.工具名"
    icon?: string
    createdAt: number
    updatedAt: number
  }

  // 智能体状态接口
  interface AgentState {
    agents: Agent[]
    selectedAgentId: string | null
  }
}

export {}
