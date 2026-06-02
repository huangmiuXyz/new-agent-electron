export const useAgentStore = defineStore(
  'agent',
  () => {
    const agents = ref<Agent[]>([
      {
        id: 'default',
        name: '默认助手',
        description: '通用AI助手',
        tags: ['默认'],
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
        contextCount: 50,
        contextTokenCount: 128000,
        speechSpeed: 1,
        speechLanguage: 'auto',
        speechModel: undefined
      }
    ])

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


    const tempAgents = ref<Agent[]>([])


    const allAgents = computed(() => {
      return [...agents.value, ...tempAgents.value]
    })


    const addTempAgent = (agent: Agent) => {

      const existingIndex = tempAgents.value.findIndex((a) => a.id === agent.id)
      if (existingIndex !== -1) {
        tempAgents.value[existingIndex] = agent
      } else {
        tempAgents.value.push(agent)
      }
    }


    const getAgentById = (id: string) => {
      return allAgents.value.find((a) => a.id === id)
    }


    const deleteAgent = (id: string) => {
      if (id === 'default') return

      const initialLength = agents.value.length
      agents.value = agents.value.filter((a) => a.id !== id)

      if (agents.value.length === initialLength) {
        tempAgents.value = tempAgents.value.filter((a) => a.id !== id)
      }
    }

    const cloneAgent = (id: string) => {
      const sourceAgent = getAgentById(id)
      if (!sourceAgent) return null

      const clonedId = nanoid()
      const now = Date.now()
      const clonedAgent: Agent = {
        ...sourceAgent,
        id: clonedId,
        name: `${sourceAgent.name} (副本)`,
        createdAt: now,
        updatedAt: now
      }

      if (agents.value.some((a) => a.id === id)) {
        agents.value.push(clonedAgent)
      } else {
        tempAgents.value.push(clonedAgent)
      }

      return clonedId
    }


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

    const replaceAgents = (newAgents: Agent[]) => {
      // 确保默认智能体始终存在
      const hasDefault = newAgents.some((a) => a.id === 'default')
      if (!hasDefault) {
        const defaultAgent: Agent = {
          id: 'default',
          name: '默认助手',
          description: '通用AI助手',
          tags: ['默认'],
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
          contextCount: 50,
          contextTokenCount: 128000,
          speechSpeed: 1,
          speechLanguage: 'auto',
          speechModel: undefined
        }
        agents.value = [defaultAgent, ...newAgents]
      } else {
        agents.value = newAgents
      }
    }

    return {
      agents,
      tempAgents,
      allAgents,
      addTempAgent,
      createAgent,
      updateAgent,
      deleteAgent,
      cloneAgent,
      getAgentById,
      getMcpByAgent,
      replaceAgents
    }
  },
  {
    persist: {
      paths: ['agents']
    }
  }
)
