import { discoverSkills, type SkillMetadata } from '../skillsService'
import { getAgentBuiltinTools } from './tools/agent-tools'
import { getCodexBuiltinTools } from './tools/codex-tools'
import { getGeneralBuiltinTools } from './tools/general-tools'
import { getMediaBuiltinTools } from './tools/media-tools'
import { getNetworkBuiltinTools } from './tools/network-tools'

type BuiltinToolGroups = Record<string, string[]>

export const getBuiltinToolGroups = (options?: {
  knowledgeBaseIds?: string[]
  skills?: SkillMetadata[]
}): BuiltinToolGroups => {
  const { pluginLoader } = usePlugins()
  const manager = pluginLoader.getPluginManager()
  const skills = options?.skills ?? discoverSkills()

  const groups: BuiltinToolGroups = {
    通用工具: Object.keys(getGeneralBuiltinTools()),
    Agent工具: Object.keys(getAgentBuiltinTools(skills)),
    网络工具: Object.keys(getNetworkBuiltinTools({ knowledgeBaseIds: options?.knowledgeBaseIds })),
    多媒体工具: Object.keys(getMediaBuiltinTools()),
    Codex工具: Object.keys(getCodexBuiltinTools())
  }

  if (manager?.getBuiltinTools) {
    const pluginTools = manager.getBuiltinTools()
    for (const [key] of pluginTools) {
      if (!groups['插件工具']) groups['插件工具'] = []
      groups['插件工具'].push(key)
    }
  }

  return groups
}

export const getBuiltinTools = (options?: {
  knowledgeBaseIds?: string[]
  skills?: SkillMetadata[]
}): Tools => {
  const { pluginLoader } = usePlugins()
  const manager = pluginLoader.getPluginManager()
  const skills = options?.skills ?? discoverSkills()

  return {
    ...getGeneralBuiltinTools(),
    ...getAgentBuiltinTools(skills),
    ...getNetworkBuiltinTools({ knowledgeBaseIds: options?.knowledgeBaseIds }),
    ...getMediaBuiltinTools(),
    ...getCodexBuiltinTools(),
    ...(manager?.getBuiltinTools ? Object.fromEntries(manager.getBuiltinTools()) : {})
  }
}
