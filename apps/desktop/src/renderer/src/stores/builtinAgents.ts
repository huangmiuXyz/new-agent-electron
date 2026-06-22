import agentsData from '@renderer/agents/builtin-agents.json'

type BuiltinAgentJson = Omit<Agent, 'createdAt' | 'updatedAt' | 'speechModel'> & {
  createdAt?: number
  updatedAt?: number
  speechModel?: { providerId: string; modelId: string }
}

export const BUILTIN_AGENT_TAG = '内置'

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

export const getBuiltinAgents = (): Agent[] => {
  return (agentsData as unknown as BuiltinAgentJson[]).map((item) => createBuiltinAgent(item))
}

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
