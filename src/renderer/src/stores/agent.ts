export const useAgentStore = defineStore(
  'agent',
  () => {
    // 智能体列表
    const agents = ref<Agent[]>([
      {
        id: 'default',
        name: '默认助手',
        description: '通用AI助手',
        systemPrompt: '你是一个有帮助的AI助手。',
        mcpServers: [],
        tools: [],
        builtinTools: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        knowledgeBaseIds: []
      }
    ])

    // 当前选中的智能体ID
    const selectedAgentId = ref<string | null>('default')

    // 计算属性：当前选中的智能体
    const selectedAgent = computed(() => {
      return allAgents.value.find((a) => a.id === selectedAgentId.value) || null
    })

    // 创建新智能体
    const createAgent = (agentData: Omit<Agent, 'id' | 'createdAt' | 'updatedAt'>) => {
      const id = nanoid()
      const now = Date.now()
      const newAgent: Agent = {
        ...agentData,
        id,
        createdAt: now,
        updatedAt: now
      }
      agents.value.push(newAgent)
      return id
    }

    // 临时智能体列表
    const tempAgents = ref<Agent[]>([])

    // 合并后的智能体列表
    const allAgents = computed(() => {
      return [...agents.value, ...tempAgents.value]
    })

    // 添加临时智能体
    const addTempAgent = (agent: Agent) => {
      // 检查是否存在同ID的临时智能体，避免重复
      const existingIndex = tempAgents.value.findIndex((a) => a.id === agent.id)
      if (existingIndex !== -1) {
        tempAgents.value[existingIndex] = agent
      } else {
        tempAgents.value.push(agent)
      }
    }

    // 根据ID获取智能体（从合并列表中）
    const getAgentById = (id: string) => {
      return allAgents.value.find((a) => a.id === id)
    }

    // 删除智能体
    const deleteAgent = (id: string) => {
      // 不能删除默认智能体
      if (id === 'default') return

      // 先尝试从持久化列表中删除
      const initialLength = agents.value.length
      agents.value = agents.value.filter((a) => a.id !== id)

      // 如果持久化列表中没变，尝试从临时列表中删除
      if (agents.value.length === initialLength) {
        tempAgents.value = tempAgents.value.filter((a) => a.id !== id)
      }

      // 如果删除的是当前选中的智能体，切换到默认智能体
      if (selectedAgentId.value === id) {
        selectedAgentId.value = 'default'
      }
    }

    // 选择智能体 (Updated to check allAgents)
    const selectAgent = (id: string) => {
      const agent = allAgents.value.find((a) => a.id === id)
      if (agent) {
        selectedAgentId.value = id
      }
    }

    // Update updateAgent to handle temp agents (though usually temp agents are not updated this way, but for completeness)
    const updateAgent = (id: string, updates: Partial<Omit<Agent, 'id' | 'createdAt'>>) => {
      const index = agents.value.findIndex((a) => a.id === id)
      if (index !== -1) {
        agents.value[index] = {
          ...agents.value[index],
          ...updates,
          updatedAt: Date.now()
        }
      } else {
        const tempIndex = tempAgents.value.findIndex((a) => a.id === id)
        if (tempIndex !== -1) {
          tempAgents.value[tempIndex] = {
            ...tempAgents.value[tempIndex],
            ...updates,
            updatedAt: Date.now()
          }
        }
      }
    }

    // ... existing getMcpByAgent ...
    const getMcpByAgent = (agentId: string) => {
      const agent = getAgentById(agentId)
      // ... existing logic ...
      const settings = useSettingsStore()
      let mcpConfig: { mcpServers: ClientConfig } = { mcpServers: {} }
      if (agent && agent.mcpServers.length > 0) {
        const filteredServers: ClientConfig = {}
        agent.mcpServers.forEach((serverName) => {
          const mcp = settings.mcpServers[serverName]
          if (mcp) {
            if (mcp.active) filteredServers[serverName] = mcp
          }
        })
        mcpConfig.mcpServers = filteredServers
      } else {
        mcpConfig.mcpServers = settings.mcpServers
      }
      return mcpConfig
    }

    return {
      agents,
      tempAgents,
      allAgents,
      addTempAgent,
      selectedAgentId,
      selectedAgent,
      createAgent,
      updateAgent,
      deleteAgent,
      selectAgent,
      getAgentById,
      getMcpByAgent
    }
  },
  {
    persist: {
      paths: ['agents', 'selectedAgentId']
    }
  }
)
