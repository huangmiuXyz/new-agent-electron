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
      return agents.value.find((a) => a.id === selectedAgentId.value) || null
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

    // 更新智能体
    const updateAgent = (id: string, updates: Partial<Omit<Agent, 'id' | 'createdAt'>>) => {
      const index = agents.value.findIndex((a) => a.id === id)
      if (index !== -1) {
        agents.value[index] = {
          ...agents.value[index],
          ...updates,
          updatedAt: Date.now()
        }
      }
    }

    // 删除智能体
    const deleteAgent = (id: string) => {
      // 不能删除默认智能体
      if (id === 'default') return

      agents.value = agents.value.filter((a) => a.id !== id)

      // 如果删除的是当前选中的智能体，切换到默认智能体
      if (selectedAgentId.value === id) {
        selectedAgentId.value = 'default'
      }
    }

    // 选择智能体
    const selectAgent = (id: string) => {
      const agent = agents.value.find((a) => a.id === id)
      if (agent) {
        selectedAgentId.value = id
      }
    }

    // 根据ID获取智能体
    const getAgentById = (id: string) => {
      return agents.value.find((a) => a.id === id)
    }

    const getMcpByAgent = (agentId: string) => {
      const agent = getAgentById(agentId)
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
    persist: true
  }
)
