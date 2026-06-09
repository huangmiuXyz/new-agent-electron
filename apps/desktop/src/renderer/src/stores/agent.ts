import {
  BUILTIN_AGENT_IDS,
  BUILTIN_AGENT_TAG,
  ensureBuiltinTags,
  getBuiltinAgents,
  mergeBuiltinAgents
} from './builtinAgents'

export const useAgentStore = defineStore(
  'agent',
  () => {
    const agents = ref<Agent[]>(getBuiltinAgents())

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
      if (isBuiltinAgent(id)) return

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
      const clonedTags = (sourceAgent.tags || []).filter(
        (tag) => tag !== BUILTIN_AGENT_TAG && (sourceAgent.id !== 'default' || tag !== '默认')
      )
      const clonedAgent: Agent = {
        ...sourceAgent,
        id: clonedId,
        name: `${sourceAgent.name} (副本)`,
        tags: clonedTags,
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
      agents.value = mergeBuiltinAgents(newAgents)
    }

    const ensureBuiltinAgents = () => {
      agents.value = mergeBuiltinAgents(agents.value).map(ensureBuiltinTags)
    }

    const isBuiltinAgent = (id: string) => {
      return BUILTIN_AGENT_IDS.has(id)
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
      replaceAgents,
      ensureBuiltinAgents,
      isBuiltinAgent
    }
  },
  {
    persist: {
      paths: ['agents'],
      afterRestore: (context) => {
        const store = context.store as ReturnType<typeof useAgentStore>
        store.ensureBuiltinAgents()
      }
    }
  }
)
